export function createTracer(env, ctx) {
  const traceId = crypto.randomUUID().replace(/-/g, '');
  const batchId = crypto.randomUUID().replace(/-/g, '');
  const spans   = [];

  function span(operationName, kind = 'internal') {
    const spanId = crypto.randomUUID().replace(/-/g, '');
    const startNs = Date.now() * 1_000_000;
    let extra = {};
    const s = {
      setD1(query, rowsRead, rowsWritten) { extra = { d1_query: (query || '').slice(0, 200), d1_rows_read: rowsRead ?? 0, d1_rows_written: rowsWritten ?? 0 }; return s; },
      setR2(op, bucket, key)             { extra = { r2_operation: op, r2_bucket: bucket, r2_key: key }; return s; },
      setHttp(method, url, status)       { extra = { http_method: method, http_url: (url || '').slice(0, 500), http_status: status }; return s; },
      setDO(cls, method)                 { extra = { do_class: cls, do_method: method }; return s; },
      end(statusCode = 'ok', message) {
        spans.push({ tenant_id: ctx?.tenant_id, workspace_id: ctx?.workspace_id, batch_id, trace_id: traceId, span_id: spanId, parent_span_id: null, operation_name: operationName, service_name: 'inneranimalmedia', kind, status_code: statusCode, status_message: message || null, start_time_unix_nano: startNs, end_time_unix_nano: Date.now() * 1_000_000, ...extra });
      },
      spanId, traceId, batchId,
    };
    return s;
  }

  async function flush() {
    if (!spans.length || !env?.DB) return;
    const cols = '(tenant_id,workspace_id,batch_id,trace_id,span_id,operation_name,service_name,kind,status_code,status_message,start_time_unix_nano,end_time_unix_nano,d1_query,d1_rows_read,d1_rows_written,r2_operation,r2_bucket,r2_key,http_method,http_url,http_status,do_class,do_method)';
    const ph  = spans.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const vals = spans.flatMap(s => [s.tenant_id,s.workspace_id,s.batch_id,s.trace_id,s.span_id,s.operation_name,s.service_name,s.kind,s.status_code,s.status_message,s.start_time_unix_nano,s.end_time_unix_nano,s.d1_query??null,s.d1_rows_read??null,s.d1_rows_written??null,s.r2_operation??null,s.r2_bucket??null,s.r2_key??null,s.http_method??null,s.http_url??null,s.http_status??null,s.do_class??null,s.do_method??null]);
    ctx?.waitUntil(env.DB.prepare(`INSERT OR IGNORE INTO otlp_traces ${cols} VALUES ${ph}`).bind(...vals).run().catch(() => {}));
  }

  return { span, flush, traceId, batchId };
}

