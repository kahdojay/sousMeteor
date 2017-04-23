# sous meteor app
---

# Usage

## run locally

    npm run start-development

# Docker

## Build a deployment package
```
npm install -g demeteorizer
chmod +x ./deploy.sh
./deploy.sh
```

## Docker run locally (dev environment)
```
docker build -t "sousmeteor:dockerfile" .demeteorized

# verify that the new image exists
docker image ls

# run the new image with staging settings (change as needed)
docker run \
  -e MONGO_URL="$(node -p 'settings=require("./settings-staging.json");settings.MONGO_URL.MONGOLAB')" \
  -e METEOR_SETTINGS="$(node -p 'settings=require("./settings-staging.json");JSON.stringify(settings)')" \
  -e SERVER_BASE=/usr/src/app/bundle/programs/server \
  -e ROOT_URL=http://127.0.0.0:3000 \
  -e NODE_ENV=staging \
  -e PORT=3000 \
  -p 3000:3000 \
  sousmeteor:dockerfile

# then open the url
open http://localhost:3000
```

## Upload to Zeit/Now

```
now \
  -e MONGO_URL="$(node -p 'settings=require("./settings-staging.json");settings.MONGO_URL.MONGOLAB')" \
  -e METEOR_SETTINGS="$(node -p 'settings=require("./settings-staging.json");JSON.stringify(settings)')" \
  -e SERVER_BASE=/usr/src/app/bundle/programs/server \
  -e ROOT_URL=http://127.0.0.0:3000 \
  -e NODE_ENV=staging \
  -e PORT=3000 \
  -p 3000:3000 \
  deploy .demeteorized
```

# Misc

## Notes:

### For deployment, you will need the latest modulus-cli and Meteor >= 1.3.2.4
    (see https://help.modulus.io/customer/portal/articles/1647770-getting-started-with-meteor-on-modulus)
    $ npm install -g modulus@next

### Execute DDP commandline

    npm install
    node
    var WebSocket = require('ws')
    var DDPClient = require('ddp-client')
    var ENDPOINT_WS = 'ws://localhost:3000/websocket'
    var ddpClient = new DDPClient({url: ENDPOINT_WS, autoReconnect : false, maintainCollections : false,})
    ddpClient.on("message", function(){ console.log("MSG FUNC: ", arguments); })
    ddpClient.connect(function(error, wasReconnect){ console.log("CONN FUNC: ERROR: ", error, " WAS RECONNECT: ", wasReconnect); })
    # ddpClient.call('sendOrders',[])
    ddpClient.close()

### Import Purveyors (then) Products

    # Make data available via json url (Google Sheets + sheetsu)

    # if remotely
    #   npm run start-staging

    # if locally
    npm run start-development

    # in a separate window/tab
    meteor shell

    # according to docs (meteor help shell) should have access to everything
    # [...] The shell supports tab completion for global variables like `Meteor`,
    # `Mongo`, and `Package`. Try typing `Meteor.is` and then pressing tab. [...]

    # note, unlike ddp calls, the parameters SHOULD NOT be in an array
    Meteor.call('importProducts', productJsonUrl, teamId);
    Meteor.call('importPurveyors', purveyorJsonUrl, teamId);

    # examples
    # Meteor.call('importTeams', "https://sheetsu.com/apis/816ed77a");
    # Meteor.call('importUsers', "https://sheetsu.com/apis/452f3fd5");
    # Meteor.call('importPurveyors', "https://sheetsu.com/apis/06d066f5");
    # Meteor.call('importProducts', "https://sheetsu.com/apis/d1d0cbb3");

### Quick load for debugging:

    npm run start-development

    # in a separate window/tab
    meteor shell

    Meteor.call('resetImportInvite', ['<your phone number>']);

## Testing errors

    # Execute DDP commandline (see above)

#### inside `meteor shell`:

    Meteor.users.findOne()
    # copy the \_id

#### inside `interactive node (ddp)`:

    ddpClient.subscribe('errors', ["<id>"])

#### inside `meteor shell`:

    # Meteor.call('triggerError', 'technical-error:email', 'Order Send Error - Sous has been notified, in the meantime please send order to your purveyors directly.', "<id>")
    # the error should show up in the `interactive node (ddp)`

## Templates:

    SEND_ORDER template: SEND_ORDER.txt
