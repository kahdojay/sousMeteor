var WebSocket = require('ws')
var DDPClient = require('ddp-client')
var ENDPOINT_WS = 'wss://sousmeteor-opetrklpxc.now.sh/websocket'

var pingCount = 0;
var ddpClient = new DDPClient({url: ENDPOINT_WS, autoReconnect : false, maintainCollections : false, socketConstructor: WebSocket})
ddpClient.on("message", function(message){
  const res = JSON.parse(message);
  console.log("MSG FUNC: ", res.msg);

  if (res.msg === 'connected') {
    ddpClient.call('💓', [])
    ddpClient.call('getUserByPhoneNumber', ['8067892921'])
    ddpClient.call('getUserByPhoneNumber', ['5623105753'])
    ddpClient.call('getSettingsConfig', [])
    ddpClient.call('getBuildInfo', [])
  }

  if (res.msg === 'result') {
    console.log("\n\n", JSON.stringify(res.result, null, 4));
    pingCount = 0;
  }

  if (res.msg === 'ping') {
    pingCount++;
  }

  if (pingCount > 1) {
    console.log('Closing the connection due to inactivity.')
    ddpClient.close()
  }

})


ddpClient.connect(function(error, wasReconnect){
  console.log("CONN FUNC: ERROR: ", error, " WAS RECONNECT: ", wasReconnect);
})
