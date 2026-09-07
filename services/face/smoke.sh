#!/usr/bin/env bash
# Curl smoke test against the three demo photos. Prints status + summary per photo.
set -uo pipefail

HOST="${FACE_SERVICE_URL:-http://localhost:8000}"
DEMO_DIR="${DEMO_DIR:-$(cd "$(dirname "$0")/../../demo" && pwd)}"
PHOTOS=("sample1.jpg" "sample2.jpg" "sample3.jpg")

echo "== /health =="
curl -sS -w '\nHTTP %{http_code}\n' "${HOST}/health"

for photo in "${PHOTOS[@]}"; do
    path="${DEMO_DIR}/${photo}"
    echo
    echo "== /detect ${photo} =="
    if [ ! -f "$path" ]; then
        echo "MISSING: $path"
        continue
    fi
    start=$(date +%s%N)
    resp=$(curl -sS -o /tmp/smoke_resp.json -w '%{http_code}' -X POST "${HOST}/detect" -F "file=@${path}")
    end=$(date +%s%N)
    elapsed_ms=$(( (end - start) / 1000000 ))
    status="$resp"
    echo "status=${status} elapsed_ms=${elapsed_ms}"
    if command -v python3 >/dev/null 2>&1; then
        python3 - "$status" "$elapsed_ms" <<'PYEOF'
import json, sys
status, elapsed_ms = sys.argv[1], sys.argv[2]
try:
    with open("/tmp/smoke_resp.json") as f:
        data = json.load(f)
except Exception as e:
    print(f"  could not parse response: {e}")
    sys.exit(0)
if status == "200":
    faces = data.get("faces", [])
    print(f"  width={data.get('width')} height={data.get('height')} face_count={len(faces)}")
    for i, fc in enumerate(faces):
        print(f"  face[{i}] bbox={fc['bbox']} det_score={fc['det_score']:.4f}")
else:
    print(f"  detail={data.get('detail')}")
PYEOF
    else
        cat /tmp/smoke_resp.json
    fi
done

rm -f /tmp/smoke_resp.json
