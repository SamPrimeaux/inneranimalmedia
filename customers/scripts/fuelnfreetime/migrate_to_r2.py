#!/usr/bin/env python3
"""
Migrate legacy Shopify Files-library assets into the fuelnfreetime R2 bucket,
organized under archive/shopify-import/ so they don't collide with the live
designs/ and products/ structure already in use.

Folder layout created:
  archive/shopify-import/logos/      - brand logo variants (FFT, fandft, etc.)
  archive/shopify-import/concepts/   - AI-generated concept art (ChatGPT images)
  archive/shopify-import/graphics/   - marketing graphics (Gone Fishing, Vette, etc.)
  archive/shopify-import/photos/     - raw phone photos (IMG_xxxx)
  archive/shopify-import/videos/     - product/marketing video clips
  archive/shopify-import/3d-models/  - .glb/.usdz 3D assets
  archive/shopify-import/misc/       - everything else (e.g. stray ad icons)

Usage:
    pip install boto3 requests --break-system-packages
    export R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    export R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxx
    export R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    export R2_BUCKET=fuelnfreetime
    python3 migrate_to_r2.py

Get the credentials from the Cloudflare dashboard:
    R2 Object Storage -> Manage R2 API Tokens -> Create API Token
    (scope: "Object Read & Write", on the fuelnfreetime bucket)
The Account ID is shown on the R2 Overview page (right-hand panel).
"""

import json
import mimetypes
import os
import sys
import time
from pathlib import Path

import boto3
import requests
from botocore.config import Config
from dotenv import load_dotenv

MANIFEST_PATH = Path(__file__).parent / "manifest.json"
ENV_PATH = Path(__file__).parent / ".env.cloudflare"


def first_match(env: dict, *keys: str) -> str | None:
    for key in keys:
        val = env.get(key) or os.environ.get(key)
        if val:
            return val.strip()
    return None


def load_env() -> dict:
    if ENV_PATH.is_file():
        load_dotenv(ENV_PATH)
    merged = {**os.environ}
    if ENV_PATH.is_file():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            merged[k.strip()] = v.strip().strip('"').strip("'")
    return merged


def get_r2_client():
    env = load_env()
    account_id = first_match(
        env,
        "R2_ACCOUNT_ID",
        "CLOUDFLARE_ACCOUNT_ID",
        "CF_ACCOUNT_ID",
        "ACCOUNT_ID",
    )
    access_key = first_match(
        env,
        "R2_ACCESS_KEY_ID",
        "AWS_ACCESS_KEY_ID",
        "CLOUDFLARE_R2_ACCESS_KEY_ID",
    )
    secret_key = first_match(
        env,
        "R2_SECRET_ACCESS_KEY",
        "AWS_SECRET_ACCESS_KEY",
        "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    )
    if not all([account_id, access_key, secret_key]):
        sys.exit(
            "Missing credentials. Need account id + access key + secret key in "
            f"{ENV_PATH} (tried R2_ACCOUNT_ID/CLOUDFLARE_ACCOUNT_ID/CF_ACCOUNT_ID, "
            "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)."
        )
    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def guess_content_type(key: str) -> str:
    ctype, _ = mimetypes.guess_type(key)
    return ctype or "application/octet-stream"


def main():
    env = load_env()
    bucket = first_match(env, "R2_BUCKET", "R2_BUCKET_NAME", "BUCKET") or "fuelnfreetime"
    s3 = get_r2_client()
    manifest = json.loads(MANIFEST_PATH.read_text())

    print(f"Migrating {len(manifest)} files into r2://{bucket}/archive/shopify-import/\n")

    ok, failed, skipped = 0, 0, 0
    for i, item in enumerate(manifest, 1):
        url, key = item["url"], item["key"]
        print(f"[{i:>2}/{len(manifest)}] {key}")

        # Skip if already present (idempotent re-runs)
        try:
            s3.head_object(Bucket=bucket, Key=key)
            print("    already exists, skipping")
            skipped += 1
            continue
        except Exception:
            pass

        try:
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            content = resp.content
        except Exception as e:
            print(f"    DOWNLOAD FAILED: {e}")
            failed += 1
            continue

        try:
            s3.put_object(
                Bucket=bucket,
                Key=key,
                Body=content,
                ContentType=guess_content_type(key),
            )
            print(f"    uploaded ({len(content):,} bytes)")
            ok += 1
        except Exception as e:
            print(f"    UPLOAD FAILED: {e}")
            failed += 1

        time.sleep(0.2)  # be polite to Shopify's CDN

    print(f"\nDone. uploaded={ok} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()
