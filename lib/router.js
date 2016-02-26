Router.route('/', {
  name: 'home',

  data: function() {
    return []
  }
});

Router.route('build', {
  where: 'server',
  path: '/build-info.json',
  action: function () {
    var json = {error: true};
    Meteor.call('getBuildInfo', function(err, buildInfo){
      console.log(buildInfo)
      json = buildInfo;
    });
    this.response.writeHead(200, {'Content-Type': 'application/json'});
    this.response.end(JSON.stringify(json));
  }
});
