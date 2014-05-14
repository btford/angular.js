#!/bin/bash

set -e

# normalize the working dir to the directory of the script
cd $(dirname $0);

cd ../..
curl "http://23.251.144.68:8000/angular/angular.js/$TRAVIS_COMMIT" | tar xz
npm install
