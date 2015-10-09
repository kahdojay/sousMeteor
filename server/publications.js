Meteor.publish('messages', function(teamKey) {
  return Messages.find({teamKey: teamKey});
});
Meteor.publish('stations', function(teamKey) {
  return Stations.find({teamKey: teamKey});
});
