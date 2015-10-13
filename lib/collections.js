Errors = new Mongo.Collection('errors');
Messages = new Mongo.Collection('messages');
Stations = new Mongo.Collection('stations');
Recipes = new Mongo.Collection('recipes');
Purveyors = new Mongo.Collection('purveyors');
Products = new Mongo.Collection('products');

Object.assign = Object.assign || objectAssign;

Stations.allow({
  insert: function() {return true;},
  update: function() {return true;},
  remove: function() {return true;}
});
Messages.allow({
  update: function() {return true;},
  insert: function() {return true;},
  remove: function() {return true;}
});
Purveyors.allow({
  update: function() {return true;},
  insert: function() {return true;},
  remove: function() {return true;}
});
Errors.allow({
  update: function() {return true;},
  insert: function() {return true;},
  remove: function() {return true;}
})
// Meteor.call('createMessage', [messageAttributes])
Meteor.methods({
  createMessage: function(messageAttributes) {
    console.log("MESSAGE ATTRS", messageAttributes);
    if(messageAttributes.imageUrl === ""){
      messageAttributes.imageUrl = "https://lh3.googleusercontent.com/-8e1m8YBYSe0/AAAAAAAAAAI/AAAAAAAAAAA/jRTl40sO4fM/s40/photo.jpg"
    }
    var newMessage = Messages.insert(messageAttributes);
    console.log("NEW MESSAGE", newMessage);
  },
  createStation: function(stationAttributes) {
    console.log("STATION ATTRS", stationAttributes);
    var station = Stations.findOne({teamKey: stationAttributes.teamKey, name: stationAttributes.name});
    if(station === undefined){
      var stationId = Stations.insert(stationAttributes);
      var station = Stations.findOne({_id: stationId});
      console.log("CREATED STATION", station);
    } else {
      console.log("Station already exists");
      // TODO: publish an error
    }
  },
  updateStation: function(stationId, stationAttributes) {
    Stations.update(stationId, {$set: {stationAttributes}});
  },
  addStationTask: function(userId, stationId, taskAttributes) {
    var realStationId = {_id: stationId};
    console.log("STATION ID ", stationId);
    console.log("TASK ATTRS ", taskAttributes);
    var stationHasTask = Stations.findOne({_id: stationId, "tasks.name": taskAttributes.name},{id:1})
    console.log(stationHasTask);
    if(stationHasTask === undefined){
      var recipeId = Recipes.insert({
        _id: taskAttributes.recipeId,
        name: taskAttributes.name,
        ingredients: [] // for future use
      });
      Stations.update(realStationId, {$push: {tasks: taskAttributes}});
    } else {
      Errors.insert({
        userId: userId,
        machineId: 'add-error',
        message: 'Station task already exists',
        createdAt: (new Date).getTime(),
      })
    }
  },
  updateStationTask: function(stationId, recipeId, taskAttributes){
    console.log("STATION ID ", stationId);
    console.log("RECIPE ID ", recipeId);
    console.log("TASK ATTRS ", taskAttributes);
    var realStationId = {_id: stationId};
    var station = Stations.findOne(realStationId);
    if(station){
      // needed to add: meteor add maxharris9:object-assign
      // var taskIdx = _.findIndex(station.tasks, function(task) {
      //   return task.recipeId === recipeId
      // });
      var taskIdx;
      // console.log("STATION", station);
      station.tasks.forEach(function(task, index) {
        if (task.recipeId == recipeId)
          taskIdx = index;
      });
      station.tasks[taskIdx] = Object.assign({}, station.tasks[taskIdx], taskAttributes);
      Stations.update(realStationId, {$set: {tasks: station.tasks}});
    }
    station = Stations.findOne({_id: stationId});
    console.log("UPDATED STATION", station);
  },
  deleteStation: function(stationId) {
    console.log("DELETE STATION", stationId);
    Stations.update(stationId, {$set: {deleted: true}});
  },
  createPurveyor: function(purveyorAttributes) {
    console.log("PURVEYOR ATTRS", purveyorAttributes);
    var purveyor = Purveyors.findOne({teamKey: purveyorAttributes.teamKey, name:purveyorAttributes.name});
    if(purveyor === undefined){
      var purveyorId = Purveyors.insert(purveyorAttributes);
      var purveyor = Purveyors.findOne({_id: purveyorId});
      console.log("CREATED PURVEYOR", purveyor);
    } else {
      console.log("Purveyor already exists");
      // TODO: publish an error
    }
  },
  addPurveyorProduct: function(purveyorId, productAttributes) {
    var realPurveyorId = {_id: purveyorId};
    console.log("PURVEYOR ID ", purveyorId);
    console.log("PRODUCT ATTRS ", productAttributes);
    var purveyorHasProduct = Purveyors.findOne({_id: purveyorId, "product.name": productAttributes.name},{id:1})
    console.log(purveyorHasProduct);
    if(purveyorHasProduct === undefined){
      var productId = Products.insert({
        _id: productAttributes.productId,
        name: productAttributes.name,
      });
      Purveyors.update(realPurveyorId, {$push: {products: productAttributes}});
    } else {
      console.log("Purveyor product already exists");
      // TODO: publish an error
    }
  },
  updatePurveyorProduct: function(purveyorId, productId, productAttributes){
    console.log("PURVEYOR ID ", purveyorId);
    console.log("PRODUCT ID ", productId);
    console.log("PRODUCT ATTRS ", productAttributes);
    var realPurveyorId = {_id: purveyorId};
    var purveyor = Purveyors.findOne(realPurveyorId);
    if(purveyor){
      // needed to add: meteor add maxharris9:object-assign
      // var productIdx = _.findIndex(purveyor.products, function(product) {
      //   return product.productId === productId
      // });
      var productIdx;
      // console.log("PURVEYOR", purveyor);
      purveyor.products.forEach(function(product, index) {
        if (product.productId == productId)
          productIdx = index;
      });
      purveyor.products[productIdx] = Object.assign({}, purveyor.products[productIdx], productAttributes);
      Purveyors.update(realPurveyorId, {$set: {products: purveyor.products}});
    }
    purveyor = Purveyors.findOne({_id: purveyorId});
    console.log("UPDATED PURVEYOR", purveyor);
  },
  deletePurveyor: function(purveyorId) {
    console.log("DELETE PURVEYOR", purveyorId);
    Purveyors.update(purveyorId, {$set: {deleted: true}});
  },

})
