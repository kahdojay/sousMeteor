var WebSocket = require('ws')
var DDPClient = require('ddp-client')
var ENDPOINT_WS = 'wss://sousmeteor-ippfnjlvqv.now.sh/websocket'

var ddpClient = new DDPClient({url: ENDPOINT_WS, autoReconnect : false, maintainCollections : false, socketConstructor: WebSocket})
ddpClient.on("message", function(){ console.log("MSG FUNC: ", arguments); })
ddpClient.connect(function(error, wasReconnect){ console.log("CONN FUNC: ERROR: ", error, " WAS RECONNECT: ", wasReconnect); })

ddpClient.call('💓', [])
ddpClient.call('getUserByPhoneNumber', ['5623105753'])
ddpClient.close()
