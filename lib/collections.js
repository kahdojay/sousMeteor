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
})
// Meteor.call('createMessage', [messageAttributes])
Meteor.methods({
  createMessage: function(messageAttributes) {
    console.log("MESSAGE ATTRS", messageAttributes);
    var newMessage = Messages.insert({
      message: messageAttributes.message,
      author: messageAttributes.author || "Default",
      teamKey: messageAttributes.teamKey,
      createdAt: new Date(),
      imageUrl: "https://lh3.googleusercontent.com/-8e1m8YBYSe0/AAAAAAAAAAI/AAAAAAAAAAA/jRTl40sO4fM/photo.jpg"
    });
    console.log("NEW MESSAGE", newMessage);
    return Messages.findOne({_id: newMessage});
  },
  createStation: function(stationAttributes) {
    console.log("STATION ATTRS", stationAttributes);
    var stationId = Stations.insert(stationAttributes);
    var station = Stations.findOne({_id: stationId});
    console.log("CREATED STATION", station);
  },
  updateStation: function(stationId, stationAttributes) {
    Stations.update(stationId, {$set: {stationAttributes}});
  },
  addStationTask: function(stationId, taskAttributes) {
    // var recipeId = Recipes.findOne({_id: recipeId }); // NOTE: recipeId will come from app??
    // var recipe = Recipes.findOne({name: taskAttributes.name});
    // var recipeId = null;
    // var recipeName = null;
    // // TODO: REFACTOR!!
    // if( recipe ){
    //   recipeId = recipe._id;
    //   recipeName = recipe.name;
    // } else {
    recipeId = Recipes.insert({
      _id: taskAttributes.recipeId,
      name: taskAttributes.name,
      ingredients: [] // for future use
    });
    recipeName = taskAttributes.name;
    // }
    Stations.update(stationId, {$push: {tasks: taskAttributes}});
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
    var purveyorId = Purveyors.insert({
      teamKey: purveyorAttributes.teamKey,
      name: purveyorAttributes.name,
      description: "",
      products:    [],
      deleted:  false
    });
    var purveyor = Purveyors.findOne({_id: purveyorId});
    console.log("CREATED PURVEYOR", purveyor);
  },
  addPurveyorProduct: function(purveyorId, productAttributes) {
    console.log("PURVEYOR ID ", purveyorId);
    console.log("PRODUCT ATTRS ", productAttributes);
    productId = Products.insert({
      name: productAttributes.name,
    });
    Purveyors.update(purveyorId, {$push: {products: {
      productId: productId,
      name: productAttributes.name,
      description: "",
      deleted: false,
      ordered: false,
      quantity: 1,
      price: 0.0,
      unit: '0 oz'
    }}});
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
