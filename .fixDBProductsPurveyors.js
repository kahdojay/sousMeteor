/*
  MongoDB script for fixing data imported from csv's
  local usage:
  > mongo localhost:3001/meteor .fixDBProductsPurveyors.js

  remote usage:
  > mongo apollo.modulusmongo.net:27017/hipyH5ip -u root -p platformforchefs .fixDBProductsPurveyors.js

*/

// iterate over products and fix data
db.products.find().forEach(function(p) {
  p.deleted = p.deleted ? p.deleted : false;

  // aggregate purveyors if we have them, handle existing purveyors
  p.purveyors = p.purveyors ? p.purveyors : [];
  if (p.Purveyor1 && !p.purveyors.some(function(e) { return e === p.Purveyor1 })) {
    p.purveyors.push(p.Purveyor1)
  };
  if (p.Purveyor2 && !p.purveyors.some(function(e) { return e === p.Purveyor2 })) {
    p.purveyors.push(p.Purveyor2)
  };
  if (p.Purveyor3 && !p.purveyors.some(function(e) { return e === p.Purveyor3 })) {
    p.purveyors.push(p.Purveyor3)
  };

  // deleting removes clutter but affects reproducability
  // delete p.Purveyor1;
  // delete p.Purveyor2;
  // delete p.Purveyor3;

  // change _id to Meteor compatible StringId
  if (typeof p._id === 'object') {
    var oldId = p._id;
    p._id = p._id.str;
    db.products.save(p);
    db.products.remove({ _id: oldId }); // remove old document
  } else {
    db.products.save(p);
  }
});
// set deleted field on purveyors
db.purveyors.find().forEach(function(p) {
  p.deleted = false;

  // change _id to Meteor compatible StringId
  if (typeof p._id === 'object') {
    var oldId = p._id;
    p._id = p._id.str;
    db.purveyors.save(p);
    db.purveyors.remove({ _id: oldId }); // remove old document
  } else {
    db.purveyors.save(p);
  }
});
