# sous meteor app
---

# Usage

## run locally

    meteor run --settings settings.json

# Misc

## Templates:

    SEND_ORDER template: SEND_ORDER.txt

## Notes:

### Execute DDP commandline

    npm install ws
    node
    WebSocket = require('ws')
    DDPClient = require('ddp-client')
    ddpClient = new DDPClient({url: 'ws://localhost:3000/websocket'})
    # ddpClient.on("message", function(){ console.log(arguments); })
    # ddpClient.on("connected", function(){ console.log(arguments); })
    ddpClient.connect(function(){ console.log(arguments); })
    ddpClient.call('sendOrders',[])
    ddpClient.close()

### Import Purveyors (then) Products

    Execute DDP commandline (see above)
    Make data available via json url (Google Sheets + sheetsu)
    ddpClient.call('importProducts', [productJsonUrl])
    ddpClient.call('importPurveyors', [purveyorJsonUrl])

### Alternative Import flow

    # if remotely
    #   MONGO_URL="mongodb://root:platformforchefs@apollo.modulusmongo.net:27017/hipyH5ip" meteor run --settings settings.json

    # if locally
    meteor run --settings settings.json

    # in a separate window/tab
    meteor shell

    # according to docs (meteor help shell) should have access to everything
    # [...] The shell supports tab completion for global variables like `Meteor`,
    # `Mongo`, and `Package`. Try typing `Meteor.is` and then pressing tab. [...]

    # note, unlike ddp calls, the parameters SHOULD NOT be in an array
    Meteor.call('importProducts',productJsonUrl);
    Meteor.call('importPurveyors', purveyorJsonUrl);

### Quick load for debugging:

    meteor run --settings settings.json

    # in a separate window/tab
    meteor shell

    Meteor.call('resetAndImport', <your phone number>);
