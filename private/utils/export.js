#!/usr/bin/env node

var WebSocket = require('ws');
var DDPClient = require('ddp-client');
var exec = require('child_process').exec;
var argv = require('minimist')(process.argv.slice(2));
var prodSettings = require('../../settings-production.json');
var ENDPOINT_WS = `ws://${prodSettings.APP.HOST}/websocket`;
var mongoDbInfo = prodSettings.MONGO_URL.MONGOLAB.match(/mongodb:\/\/(.*):(.*)@(.*)\/(\w+)(.*)/);
var mongoDbInfoHost = mongoDbInfo[3].split(',')[0]
var exportLocation = '~/Desktop';
var exportFile = 'export.csv';
var exportType = null,
  exportColumns = null,
  exportSort = null;

var ddpClient = new DDPClient({
  url: ENDPOINT_WS,
  autoReconnect : false,
  maintainCollections : false,
  socketConstructor: WebSocket,
});

if(argv.hasOwnProperty('exportLocation') === true){
  exportLocation = aexportFgv.exportLocation;
}
if(argv.hasOwnProperty('exportType') === true){
  exportType = argv.exportType;
}

if(exportType === null){
  console.error('Missing export type.')
  process.exit(1)
}

function exitProcess(){
  process.exit(0)
}

switch(exportType){
  case 'products':
    exportColumns = 'process,_id,action,name,teamCode,category,purveyors,amount,unit,par,sku,description,price,packSize';
    exportSort = '{ teamCode : 1, name: 1 }';
    break;

  case 'purveyors':
    exportColumns = 'process,action,_id,teamCode,purveyorCode,name,orderEmails,timeZone,orderCutoffTime,orderMinimum,deliveryDays,notes,email,phone,orderContact,description,sendEmail,sendFax,fax,uploadToFTP';
    exportSort = '{ teamCode : 1, name: 1 }';
    break;

  default:
    break;
}

var mongoExportCmd = `mongoexport -h ${mongoDbInfoHost} -d ${mongoDbInfo[4]} --type=csv -c export --fields=${exportColumns} --sort '${exportSort}' -o ${exportLocation}/${exportFile} -u ${mongoDbInfo[1]} -p ${mongoDbInfo[2]}`

// console.log(mongoExportCmd)
// exitProcess();

function executeExport() {

  ddpClient.connect(function(error, wasReconnect){
    if(error){
      console.error('Error connecting to the server')
      process.exit(1)
    } else {
      console.log(`Successfully connected to ${ENDPOINT_WS}`);


      if(exportType === 'products'){
        console.log('Exporting products...')
      }

      ddpClient.call('exportProducts', [], function(res) {
        ddpClient.close();

        exec(mongoExportCmd, function(error, stdout, stderr){
          // console.log(stdout);
          exitProcess();
        }.bind(this));


      }.bind(this));
    }
  }.bind(this));
}

executeExport();
