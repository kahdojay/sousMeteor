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
