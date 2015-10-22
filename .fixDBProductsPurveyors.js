/*
  MongoDB script for fixing data imported from csv's
  local usage:
  > mongo localhost:3001/meteor .fixDBProductsPurveyors.js

  remote usage:
  > mongo apollo.modulusmongo.net:27017/hipyH5ip -u root -p platformforchefs .fixDBProductsPurveyors.js

*/
// generate purveyors array for product
db.products.find().forEach(function(p) {
  p.purveyors = [];
  p.deleted = false;
  if (p.Purveyor1 !== '') { p.purveyors.push(p.Purveyor1) };
  if (p.Purveyor2 !== '') { p.purveyors.push(p.Purveyor2) };
  if (p.Purveyor3 !== '') { p.purveyors.push(p.Purveyor3) };
  delete p.Purveyor1;
  delete p.Purveyor2;
  delete p.Purveyor3;
  db.products.save(p);
});
// set deleted field on purveyors
db.purveyors.find().forEach(function(p) {
  p.deleted = false;
  db.purveyors.save(p);
});
