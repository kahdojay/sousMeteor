#!/usr/bin/env bash

rm -rf .demeteorized
demeteorizer --architecture=os.linux.x86_64 --json="$(node -p 'var include={}; try{include=require("./include.json");}catch(e){} JSON.stringify(include)')"
cd .demeteorized
tar -czf myProject.tar.gz bundle
rm -rf bundle
split -b 999k myProject.tar.gz "myProject.tar.gz.meteor-part-"
rm myProject.tar.gz
cp ../private/docker/* ./
rm ./settings-staging.json