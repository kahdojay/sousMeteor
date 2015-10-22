# sous meteor app
---

# Usage

## run locally

    meteor run --settings settings.json

SEND_ORDER template: SEND_ORDER.txt

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

## Seeding the database
* install mongo locally
* download csv's and make them available locally
* make sure meteor app is running
* update products
  * `mongoimport -h localhost:3001 --db meteor --collection products --type csv --headerline --upsertFields name,description,price,Purveyor1,Purveyor2,Purveyor3,amount,unit --file <filename-products.csv>`
* update purveyors
  * `mongoimport -h localhost:3001 --db meteor --collection purveyors --type csv --headerline --upsertFields name,description --file <filename.csv>`
* aggregate and set missing fields
  * `mongo localhost:3001/meteor .fixDBProductsPurveyors.js`
