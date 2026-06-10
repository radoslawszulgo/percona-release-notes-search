#!/bin/bash
set -e

INIT_FLAG="/data/db/.mongod_initialized"

if [ ! -f "$INIT_FLAG" ]; then
  echo "==> First run: initializing replica set and users..."

  # Start mongod without auth or keyFile so we can bootstrap
  mongod --dbpath /data/db --bind_ip_all --port 27017 --replSet rs0 \
    --setParameter mongotHost=mongot.search-percona:27028 \
    --setParameter searchIndexManagementHostAndPort=mongot.search-percona:27028 \
    --setParameter useGrpcForSearch=true \
    --setParameter skipAuthenticationToSearchIndexManagementServer=false \
    --fork --logpath /tmp/mongod-init.log

  echo "==> Waiting for mongod to accept connections..."
  until mongosh --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
    sleep 1
  done

  echo "==> Initiating replica set rs0..."
  mongosh --quiet --eval "
    rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongod.search-percona:27017' }] });
  "

  echo "==> Waiting for PRIMARY election..."
  until mongosh --quiet --eval "rs.status().myState === 1" 2>/dev/null | grep -q "true"; do
    sleep 1
  done

  echo "==> Creating root user..."
  mongosh admin --quiet --eval "
    db.createUser({ user: 'root', pwd: 'password', roles: ['root'] });
  "

  echo "==> Creating mongotUser..."
  mongosh admin -u root -p password --quiet --eval "
    db.createUser({ user: 'mongotUser', pwd: 'mongotPassword', roles: [{ role: 'searchCoordinator', db: 'admin' }] });
  "

  touch "$INIT_FLAG"
  echo "==> Initialization complete, shutting down bootstrap mongod..."
  mongosh admin -u root -p password --quiet --eval "db.shutdownServer()" || true
  # Wait for clean shutdown
  sleep 3
fi

echo "==> Starting mongod with full config..."
exec mongod --config /etc/mongod.conf
