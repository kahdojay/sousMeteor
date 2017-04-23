# Docker (Mac OSX)

## Build a deployment package
```
## install homebrew if not installed: https://brew.sh/
# brew install cask
## optional, if you want to run/verify the docker image locally
# brew cask install docker kitematic 

npm install -g now
## then run through the now login process
# now --login

# install demeteorizer
npm install -g demeteorizer

# clone the files from the gist
git clone https://gist.github.com/720382517a24d40baf3d7a4c6aa5d0be.git ./private/docker

# edit the ./private/docker/Dockerfile as desired (eg. Add MongoDB, etc)

chmod +x ./private/docker/deploy.sh
./private/docker/deploy.sh
```


## Docker run locally (dev environment)

Note: change `<env>` in the commands below, also this assumes that you have a file `./settings-<env>.json`, for example: `staging`

```
docker build -t "myproject:dockerfile" .demeteorized

# verify that the new image exists
docker image ls

# run the new image with staging settings (change as needed)
docker run \
  -e MONGO_URL="$(node -p 'settings=require("./settings-<env>.json");settings.MONGO_URL.MONGOLAB')" \
  -e METEOR_SETTINGS="$(node -p 'settings=require("./settings-<env>.json");JSON.stringify(settings)')" \
  -e SERVER_BASE=/usr/src/app/bundle/programs/server \
  -e ROOT_URL=http://127.0.0.0:3000 \
  -e NODE_ENV=<env> \
  -e PORT=3000 \
  -p 3000:3000 \
  myproject:dockerfile

# then open the url
open http://localhost:3000
```


## Upload to Zeit/Now

Note: change `<env>` in the commands below, also this assumes that you have a file `./settings-<env>.json`, for example: `staging`

```
now \
  -e MONGO_URL="$(node -p 'settings=require("./settings-<env>.json");settings.MONGO_URL.MONGOLAB')" \
  -e METEOR_SETTINGS="$(node -p 'settings=require("./settings-<env>.json");JSON.stringify(settings)')" \
  -e SERVER_BASE=/usr/src/app/bundle/programs/server \
  -e ROOT_URL=http://127.0.0.0:3000 \
  -e NODE_ENV=<env> \
  -e PORT=3000 \
  -p 3000:3000 \
  deploy .demeteorized
```