# sous meteor app
---

# Usage

## run locally

    npm run start-development

# Misc

## Notes:

### For deployment, you will need modulus

    npm install -g https://github.com/sousapp/modulus-cli

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
