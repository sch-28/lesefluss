#!/bin/sh
# Host network changes (eno1's IPv6 re-announcing) abort vite module loads in
# Chromium with net::ERR_NETWORK_CHANGED (LESE-174); a network namespace sees
# none. The dummy interface keeps navigator.onLine true, and the unreachable
# default route fails any outside request at once.
SETUP='ip link set lo up &&
	ip link add e2e0 type dummy &&
	ip link set e2e0 addrgenmode none &&
	ip addr add 192.0.2.1/24 dev e2e0 &&
	ip link set e2e0 up &&
	ip route add unreachable default'
if unshare -rn sh -c "$SETUP" 2>/dev/null; then
	exec unshare -rn sh -c "$SETUP"' && exec "$@"' sh "$@"
fi
echo "e2e-isolated: no network namespace here, running on the host network" >&2
exec "$@"
