package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const maxOutput = 256 * 1024

type execRequest struct {
	Command   string `json:"command"`
	Cwd       string `json:"cwd"`
	TimeoutMs int    `json:"timeout_ms"`
}

type execResult struct {
	OK       bool   `json:"ok"`
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	TimedOut bool   `json:"timed_out"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/exec", handleExec)
	mux.HandleFunc("/v1/exec", handleExec)
	mux.HandleFunc("/v1/mounts", handleMounts)
	mux.HandleFunc("/v1/workspace/tree", handleWorkspaceTree)
	mux.HandleFunc("/v1/info", handleInfo)

	addr := "0.0.0.0:" + port
	fmt.Printf("[iam-sandbox-go] listening on %s\n", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		fmt.Fprintf(os.Stderr, "listen error: %v\n", err)
		os.Exit(1)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "method_not_allowed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"service": "iam-sandbox-go",
		"version": envOr("IAM_IMAGE_TAG", "sandbox-go-v1"),
		"exec":    true,
		"api":     "v1",
	})
}

func handleInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"pool_id":      envOr("CONTAINER_POOL_ID", "inneranimalmedia"),
		"workspace_id": strings.TrimSpace(os.Getenv("WORKSPACE_ID")),
		"mount_root":   workspaceRoot(),
	})
}

func handleMounts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false})
		return
	}
	bucket := strings.TrimSpace(os.Getenv("R2_BUCKET_NAME"))
	prefix := strings.TrimSpace(os.Getenv("R2_BUCKET_PREFIX"))
	fuseConfigured := bucket != "" &&
		strings.TrimSpace(os.Getenv("AWS_ACCESS_KEY_ID")) != "" &&
		strings.TrimSpace(os.Getenv("AWS_SECRET_ACCESS_KEY")) != "" &&
		strings.TrimSpace(os.Getenv("IAM_SANDBOX_R2_FUSE")) != "0"

	r2Mount := envOr("R2_MOUNT", "/tmp/r2")
	mounts := []map[string]any{}
	for _, spec := range []struct{ path, label string }{
		{r2Mount, "r2"},
		{"/mnt/workspace", "workspace"},
	} {
		st, err := os.Stat(spec.path)
		ok := err == nil && st.IsDir()
		mounted := fuseConfigured && isFuseMount(spec.path)
		mounts = append(mounts, map[string]any{
			"name":       spec.label,
			"path":       spec.path,
			"mounted":    ok,
			"fuse":       mounted,
			"fuse_ready": fuseConfigured,
			"bucket":     bucket,
			"prefix":     prefix,
			"readonly":   strings.TrimSpace(os.Getenv("IAM_R2_FUSE_READONLY")) != "0",
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "mounts": mounts})
}

func isFuseMount(path string) bool {
	data, err := os.ReadFile("/proc/mounts")
	if err != nil {
		return false
	}
	target := filepath.Clean(path)
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		if filepath.Clean(fields[1]) == target && strings.Contains(fields[2], "fuse") {
			return true
		}
	}
	return false
}

func workspaceRoot() string {
	for _, p := range []string{"/mnt/workspace", "/workspace", "/tmp/workspace"} {
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			return p
		}
	}
	return "/tmp/workspace"
}

func handleWorkspaceTree(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false})
		return
	}
	root := workspaceRoot()
	rel := strings.TrimPrefix(strings.TrimSpace(r.URL.Query().Get("path")), "/")
	target := filepath.Clean(filepath.Join(root, rel))
	if !strings.HasPrefix(target, filepath.Clean(root)) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "path_escape"})
		return
	}
	entries, err := os.ReadDir(target)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": err.Error(), "root": root, "path": rel})
		return
	}
	items := make([]map[string]any, 0, len(entries))
	for _, e := range entries {
		items = append(items, map[string]any{
			"name":  e.Name(),
			"dir":   e.IsDir(),
			"path":  filepath.Join(rel, e.Name()),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "root": root, "path": rel, "entries": items})
}

func handleExec(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "method_not_allowed"})
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "read_body"})
		return
	}
	var req execRequest
	if len(body) > 0 {
		if err := json.Unmarshal(body, &req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "invalid_json"})
			return
		}
	}
	command := strings.TrimSpace(req.Command)
	if command == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "command_required"})
		return
	}
	cwd := strings.TrimSpace(req.Cwd)
	if cwd == "" {
		cwd = workspaceRoot()
	}
	timeoutMs := req.TimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = 30000
	}
	if timeoutMs > 120000 {
		timeoutMs = 120000
	}
	result := runCommand(command, cwd, time.Duration(timeoutMs)*time.Millisecond)
	// HTTP 200 when the exec API handled the request; non-zero exit codes live in the JSON body.
	writeJSON(w, http.StatusOK, result)
}

func runCommand(command, cwd string, timeout time.Duration) execResult {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "/bin/sh", "-lc", command)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "HOME="+cwd)
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	runErr := cmd.Run()

	out := stdout.String()
	if len(out) > maxOutput {
		out = out[:maxOutput]
	}
	errOut := stderr.String()
	if len(errOut) > maxOutput {
		errOut = errOut[:maxOutput]
	}

	exitCode := 0
	timedOut := false
	if runErr != nil {
		if ctx.Err() == context.DeadlineExceeded {
			exitCode = 124
			timedOut = true
		} else if exitErr, ok := runErr.(*exec.ExitError); ok && exitErr.ExitCode() >= 0 {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}

	return execResult{
		OK:       exitCode == 0 && !timedOut,
		ExitCode: exitCode,
		Stdout:   out,
		Stderr:   errOut,
		TimedOut: timedOut,
	}
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
