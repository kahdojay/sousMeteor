# sous meteor app
---

# Usage

## run locally

    npm run start-development

# Misc

## Notes:

### Execute DDP commandline

    npm install
    node
    var WebSocket = require('ws')
    var DDPClient = require('ddp-client')
    var ddpClient = new DDPClient({url: 'ws://localhost:3000/websocket'})
    # ddpClient.on("message", function(){ console.log(arguments); })
    # ddpClient.on("connected", function(){ console.log(arguments); })
    ddpClient.connect(function(){ console.log(arguments); })
    # ddpClient.call('sendOrders',[])
    ddpClient.close()

### Import Purveyors (then) Products

    # Execute DDP commandline (see above)
    # Make data available via json url (Google Sheets + sheetsu)
    ddpClient.call('importProducts', [productJsonUrl])
    ddpClient.call('importPurveyors', [purveyorJsonUrl])

### Alternative Import flow

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
    Meteor.call('importProducts',productJsonUrl);
    Meteor.call('importPurveyors', purveyorJsonUrl);

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

    Errors.insert({
      userId: "<id>",
      machineId: 'technical-error:email',
      message: 'Order Send Error - we\'ve been notified, but please send order from your purveyors directly',
      createdAt: new Date(),
    });
    # the error should show up in the `interactive node (ddp)`

## Templates:

    SEND_ORDER template: SEND_ORDER.txt
