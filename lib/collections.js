Messages = new Mongo.Collection('messages');
Stations = new Mongo.Collection('stations');
Recipes = new Mongo.Collection('recipes');

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
  },
  createStation: function(stationAttributes) {
    console.log("STATION ATTRS", stationAttributes);
    var stationId = Stations.insert({
      teamKey:  stationAttributes.teamKey,
      name:     stationAttributes.name,
      tasks:    [],
      deleted:  false
    });
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
      name: taskAttributes.name,
      ingredients: [] // for future use
    });
    recipeName = taskAttributes.name;
    // }
    Stations.update(stationId, {$push: {tasks: {
      recipeId: recipeId,
      name: recipeName,
      description: "",
      deleted: false,
      completed: false,
      quantity: 1,
      unit: 0 // for future use
    }}});
  },
  updateStationTask: function(stationId, recipeId, taskAttributes){
    console.log("RECIPE ID", recipeId);
    console.log("TASK ATTRS", taskAttributes);
    var realStationId = {_id: stationId};
    var station = Stations.findOne(realStationId);
    if(station !== null){
      // needed to add: meteor add maxharris9:object-assign
      // var taskIdx = _.findIndex(station.tasks, function(task) {
      //   return task.recipeId === recipeId
      // });
      var taskIdx;
      station.tasks.forEach(function(task, index) {
        if (task.recipeId == recipeId)
          taskIdx = index;
      });
      station.tasks[taskIdx] = Object.assign({}, station.tasks[taskIdx], taskAttributes);
      Stations.update(realStationId, {$set: {tasks: station.tasks}});
    }
    station = Stations.findOne({_id: stationId});
    // console.log("UPDATED STATION", station);
  },
  deleteStation: function(stationId) {
    console.log("DELETE STATION", stationId);
    Stations.update(stationId, {$set: {deleted: true}});
  },
  deleteTask: function(stationId, recipeId) {

  }

})
