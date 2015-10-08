Messages = new Mongo.Collection('messages');
Stations = new Mongo.Collection('stations');

Stations.allow({
  insert: function() {return true;},
  update: function() {return true;},
  remove: function() {return true;}
});
Messages.allow({
  update: function(userId) {return true;},
  remove: function(userId) {return true;},
  insert: function(userId) {return true;}
})
// Meteor.call('createMessage', [messageAttributes])
Meteor.methods({
  createMessage: function(messageAttributes) {
    Messages.insert({
      message: messageAttributes.message,
      author: messageAttributes.author || "Default",
      teamKey: messageAttributes.teamKey,
      createdAt: new Date(),
      imageUrl: "https://lh3.googleusercontent.com/-8e1m8YBYSe0/AAAAAAAAAAI/AAAAAAAAAAA/jRTl40sO4fM/photo.jpg"
    });
  },
  createStation: function(stationAttributes) {
    console.log("STATION ATTRS", stationAttributes);
    var stationId = Stations.insert({
      teamKey:  stationAttributes.teamKey,
      name:     stationAttributes.name,
      tasks:    [],
      deleted:  false
    });
    console.log("CREATED STATION", Stations.findOne({_id: stationId}))
    return Stations.findOne({_id: stationId});
  },
  updateStation: function(stationId, stationAttributes) {
    Stations.update(stationId, {$set: {stationAttributes}});
  }


})
