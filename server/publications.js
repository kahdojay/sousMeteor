Meteor.publish('messages', function(teamKey) {
  return Messages.find({teamKey: teamKey}, {sort: {createdAt: -1}, limit:20});
});
Meteor.publish('stations', function(teamKey) {
  return Stations.find({teamKey: teamKey});
});
Meteor.publish('purveyors', function(teamKey) {
  return Purveyors.find({teamKey: teamKey});
});
Meteor.publish('errors', function(userId) {
  return Errors.find({userId: userId});
});
