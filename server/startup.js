Errors = new Mongo.Collection('errors');
Messages = new Mongo.Collection('messages');
Recipes = new Mongo.Collection('recipes');
Orders = new Mongo.Collection('orders');
Purveyors = new Mongo.Collection('purveyors');
Products = new Mongo.Collection('products');
Categories = new Mongo.Collection('categories');
Teams = new Mongo.Collection('teams');
Settings = new Mongo.Collection('settings');
Export = new Mongo.Collection('export');
CartItems = new Mongo.Collection('cart_items');
TeamPurveyorSettings = new Mongo.Collection('team_purveyor_settings');

var allowPermissions = {
  insert: function() {return true;},
  update: function() {return true;},
  remove: function() {return true;}
};
Errors.allow(allowPermissions);
Messages.allow(allowPermissions);
Recipes.allow(allowPermissions);
Orders.allow(allowPermissions);
Purveyors.allow(allowPermissions);
Products.allow(allowPermissions);
Categories.allow(allowPermissions);
Teams.allow(allowPermissions);
Settings.allow(allowPermissions);
Export.allow(allowPermissions);
CartItems.allow(allowPermissions);
TeamPurveyorSettings.allow(allowPermissions);

if(Meteor.isServer){

  _ = lodash
  base = process.env.PWD
  pkgInfo = Npm.require(base + '/package.json');

  stream = Npm.require('stream');
  fs = Npm.require('fs');
  slug = Npm.require('slug');
  aguid = Npm.require('aguid');
  s = Npm.require('underscore.string');
  Putter =  Npm.require('base64-string-s3');
  Mixpanel = Npm.require('mixpanel');
  // Phaxio = Npm.require('phaxio');


  settingsConfig = {};
  try {
    var includeFile = base + '/include.json';
    var includeStats = fs.statSync(includeFile);
    if(includeStats.isFile()){
      var includeInfo = Npm.require(includeFile);
      settingsConfig = includeInfo.config;
      pkgInfo.build = includeInfo.build;
    }
  } catch(e){
    if(pkgInfo.hasOwnProperty('config') === true){
      settingsConfig = pkgInfo.config;
    }
  }
  settingsConfig.itunesUrl = Meteor.settings.APP.ITUNES_URL

  log = logger.bunyan.createLogger({
    name: 'Sous',
    stream: process.stdout.isTTY ?
              new logger.bunyanPrettyStream(process.stdout) :
              process.stdout,
    level: 'debug'
  })


  Object.assign = Object.assign || objectAssign;

  STATUS = {
    USER: { NEW: 'NEW', EXISTING: 'EXISTING' },
    MESSAGE: { NEW: 'NEW', EXISTING: 'EXISTING' },
    NOTEPAD: { NEW: 'NEW', EXISTING: 'EXISTING' },
    CART_ITEM: { NEW: 'NEW', ORDERED: 'ORDERED', RECEIVED: 'RECEIVED', DELETED: 'DELETED' },
  };

  // TODO: remove this after all data transition to CartItems
  EMPTY_CART = { date: null, total: 0.0, orders: {} };

  APPROVED_PRODUCT_ATTRS = {
    name: true,
    description: true,
    purveyors: true,
    amount: true,
    unit: true,
    sku: true,
    price: true,
    par: true,
    packSize: true,
    deleted: true,
    updatedAt: true,
  };

  APPROVED_CATEGORY_ATTRS = {
    name: true,
    deleted: true,
    updatedAt: true,
  }

  APPROVED_CART_ITEM_ATTRS = {
    purveyorId: true,
    orderId: true,
    quantity: true,
    note: true,
    quantityReceived: true,
  }

  APPROVED_PARSE_UPDATE_ATTRS = {
    "appVersion": 1,
    "appBuildNumber": 1,
    "deviceType": 1,
    "deviceToken": 1,
    "deviceModel": 1,
    "deviceId": 1,
    "deviceName": 1,
    "deviceSystemName": 1,
    "deviceSystemVersion": 1,
    "installationId": 0, // NOTE: this field is readonly, so it can only be set once
    "channels": 1,
    "phoneNumber": 1,
    "userId": 1,
    "badge": 1,
  };

  PARSE = {
    INSTALLATION_URL: 'https://api.parse.com/1/installations',
    PUSH_URL: 'https://api.parse.com/1/push',
    CONFIG_URL: 'https://api.parse.com/1/config',
    HEADERS: {
      "Accept": "application/json",
      "X-Parse-Application-Id": Meteor.settings.PARSE.APPLICATION_ID,
      "X-Parse-REST-API-Key": Meteor.settings.PARSE.REST_API_KEY,
      "Content-Type": "application/json",
    }
  }

  excludeSlackNotificationTeams = {}

  putterOptions = {
      key: Meteor.settings.AWS_ACCESS_KEY_ID,
      secret: Meteor.settings.AWS_SECRET_ACCESS_KEY,
      bucket: Meteor.settings.S3_BUCKET,
      // chunkSize: 512 // [optional] defaults to 1024
  }
  putter = new Putter(putterOptions);
  mixpanel = Mixpanel.init(Meteor.settings.MIXPANEL.TOKEN)

  Meteor.startup(function() {
    // .createIndex( { "createdAt": 1 }, { expireAfterSeconds: 3600 } )
    Errors._ensureIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 5 }
    );
    Messages._ensureIndex(
      { teamId: 1, createdAt: -1 }
    );
    Products._ensureIndex(
      { teamId: 1}
    );
    Purveyors._ensureIndex(
      { teamId: 1}
    );
    Categories._ensureIndex(
      { teamId: 1}
    );
    Settings._ensureIndex(
      { userId: 1 }
    );
    Orders._ensureIndex(
      { teamId: 1}
    );
    Orders._ensureIndex(
      { teamId: 1, orderedAt: 1}
    );
    CartItems._ensureIndex(
      { teamId: 1 }
    );
    CartItems._ensureIndex(
      { orderId: 1 }
    );
    CartItems._ensureIndex(
      { teamId: 1, orderId: 1 }
    );
    CartItems._ensureIndex(
      { teamId: 1, purveyorId: 1, productId: 1, status: 1 }
    );
    TeamPurveyorSettings._ensureIndex(
      { teamId: 1, purveyorId: 1 }
    );
    TeamPurveyorSettings._ensureIndex(
      { teamCode: 1, purveyorCode: 1 }
    );

    // configure Mandrill
    Mandrill.config({
      username: Meteor.settings.MANDRILL.USERNAME,  // the email address you log into Mandrill with. Only used to set MAIL_URL.
      key: Meteor.settings.MANDRILL.API_KEY,  // get your Mandrill key from https://mandrillapp.com/settings/index
      // port: Meteor.settings.MANDRILL.PORT,  // defaults to 465 for SMTP over TLS
      host: Meteor.settings.MANDRILL.HOST,  // the SMTP host
      baseUrl: Meteor.settings.MANDRILL.BASEURL, // Meteor.settings.MANDRILL.BASEURL  // update this in case Mandrill changes its API endpoint URL or version
    });
    slack.onError = function (err) {
      log.error('SLACK API error:', err)
    };

    // setup putter
    putter.on('progress', function (data) {
      log.trace('progress', data);
      // progress { percent: 20, written: 768, total: 3728 }
    });
    putter.on('response', function (data) {
      log.trace('response', data);
      // response { path: 'https://<bucket>.s3.amazonaws.com/images/success.jpg' }
    });
    putter.on('error', function (err) {
      log.error('putter error', err);
    });
    putter.on('close', function () {
      log.trace('closed connection');
    });
  });
}
