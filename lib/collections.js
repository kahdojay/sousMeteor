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
    var author;
    if (messageAttributes.author && messageAttributes.author.match(/@/) == null) {
      author = messageAttributes.author;
    } else {
      author = messageAttributes.author.split("@")[0];
    }
    console.log("AUTHOR", author)
    var newMessage = Messages.insert({
      message: messageAttributes.message,
      author: author || "Default",
      teamKey: messageAttributes.teamKey,
      createdAt: new Date(),
      imageUrl: "https://lh3.googleusercontent.com/-8e1m8YBYSe0/AAAAAAAAAAI/AAAAAAAAAAA/jRTl40sO4fM/photo.jpg"
    });
    console.log("NEW MESSAGE", newMessage);
    return Messages.findOne({_id: newMessage});
  },
  createStation: function(stationAttributes) {
    console.log("STATION ATTRS", stationAttributes);
    var teamStations = Stations.find({teamKey: stationAttributes.teamKey}).map(function(station, index){
      return station.name;
    })
    console.log("TEAM STATIONS", teamStations);
    if (teamStations.indexOf(stationAttributes.name) === -1) {
      var stationId = Stations.insert({
        teamKey:  stationAttributes.teamKey,
        name:     stationAttributes.name,
        tasks:    [],
        deleted:  false
      });
      var station = Stations.findOne({_id: stationId});
      console.log("CREATED STATION", station);
    } else {
      return "Station already exists";
    }
  },
  updateStation: function(stationId, stationAttributes) {
    Stations.update(stationId, {$set: {stationAttributes}});
  },
  addStationTask: function(stationId, taskAttributes) {
    recipeId = Recipes.insert({
      name: taskAttributes.name,
      ingredients: [] // for future use
    });
    recipeName = taskAttributes.name;
    var station = Stations.findOne(stationId);
    console.log("STATION", station.tasks.length);
    var stationTasks = station.tasks.map(function(task, index){
      if (! task.deleted) {
        return task.name
      }
    });
    // console.log("STATION TASKS", stationTasks);
    console.log("BOOL", stationTasks.indexOf({name: taskAttributes.name}));
    if (stationTasks.indexOf(taskAttributes.name) == -1) {
      Stations.update(stationId, {$push: {tasks: {
        recipeId: recipeId,
        name: recipeName,
        description: "",
        deleted: false,
        completed: false,
        quantity: 1,
        unit: 0 // for future use
      }}});
    } else {
      return "This station already exists"
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
    var teamPurveyors = Purveyors.find({teamKey: purveyorAttributes.teamKey}).map(function(purveyor, index){
      return purveyor.name;
    })
    console.log("TEAM PURVEYORS", teamPurveyors);
    if (teamPurveyors.indexOf(purveyorAttributes.name) === -1) {
      var purveyorId = Purveyors.insert({
        teamKey: purveyorAttributes.teamKey,
        name: purveyorAttributes.name,
        description: "",
        products:    [],
        deleted:  false
      });
      var purveyor = Purveyors.findOne({_id: purveyorId});
      console.log("CREATED PURVEYOR", purveyor);
    }
  },
  addPurveyorProduct: function(purveyorId, productAttributes) {
    console.log("PURVEYOR ID ", purveyorId);
    console.log("PRODUCT ATTRS ", productAttributes);
    productId = Products.insert({
      name: productAttributes.name,
    });
    var purveyor = Purveyors.findOne(purveyorId);
    console.log("PURVEYOR", purveyor.products.length);
    var purveyorProducts = purveyor.products.map(function(product, index){
      if (! product.deleted) {
        return product.name
      }
    });
    // console.log("STATION TASKS", purveyorProducts);
    console.log("BOOL", purveyorProducts.indexOf({name: productAttributes.name}));
    if (purveyorProducts.indexOf(productAttributes.name) == -1) {
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
