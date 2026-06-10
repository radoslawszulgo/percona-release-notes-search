#!/bin/bash
set -e
echo "Starting MongoDB initialization..."
sleep 2

echo "Initiating replica set rs0..."
mongosh --eval "
try {
  rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'mongod.search-percona:27017' }]
  });
  print('Replica set initiated');
} catch (e) {
  if (e.codeName === 'AlreadyInitialized') {
    print('Replica set already initialized');
  } else {
    throw e;
  }
}
"

echo "Waiting for PRIMARY election..."
mongosh --eval "
let attempts = 0;
while (rs.status().myState !== 1 && attempts < 30) {
  sleep(1000);
  attempts++;
}
if (rs.status().myState !== 1) throw new Error('Timed out waiting for PRIMARY');
print('Node is PRIMARY');
"

echo "Creating user..."
mongosh --eval "
const adminDb = db.getSiblingDB('admin');
try {
   adminDb.createUser({
      user: 'mongotUser',
      pwd: 'mongotPassword',
      roles: [{ role: 'searchCoordinator', db: 'admin' }]
   });
   print('User mongotUser created successfully');
} catch (error) {
   if (error.code === 11000) {
      print('User mongotUser already exists');
   } else {
      print('Error creating user: ' + error);
   }
}
"
echo "MongoDB initialization completed."
