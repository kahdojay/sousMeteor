if(Meteor.isServer){
  Meteor.methods({
    reportOrders: function(days = 7) {
      var ret = {}
      var excludeUsers = ['SWwJP8PBPZiqzmiPJ','jQFDysefypfdETcqn','BrJTYiK9FocfPJiAM','t3jtsLsQr2GZNtkc6','oWH4sbPnaX5q9d3Xb']
      Teams.find({teamCode: {$not: /(DEMO|^DEV$)/}, betaAccess: {$exists: true}, active: {$not: /FALSE/}}).fetch().forEach(function(team) {
        var mostRecentOrder = Orders.findOne({teamCode: team.teamCode}, {sort: {orderedAt: -1}})
        var teamLength = team.users ? team.users.length : 'N/A'
        excludeUsers.forEach(function(excludeUserId) {
          if (team.users.indexOf(excludeUserId) !== -1) {
            teamLength--
          }
        })
        ret[team.teamCode] = {
          createdAt: moment(team.createdAt).format('MM/DD/YY'),
          members: teamLength,
          orders: 0,
          lastOrder: mostRecentOrder ? moment(mostRecentOrder.orderedAt).format('ddd M/D') : 'N/A'
        }
      })
      Orders.find({teamCode: {$not: /(DEMO|^DEV$)/}, createdAt: {$gte: moment().subtract(days, 'days').toISOString()}}, {sort: {orderedAt: 1}}).fetch().forEach(function(order) {
        var tc = order.teamCode
        if(ret[tc] !== undefined){
          ret[tc].orders = ret[tc].orders + 1,
          ret[tc].lastOrder = moment(order.orderedAt).format('ddd M/D')
        } else {
          var team = Teams.findOne({teamCode: order.teamCode})
          var teamLength = team.users ? team.users.length : 'N/A'
          excludeUsers.forEach(function(excludeUserId) {
            if (team.users.indexOf(excludeUserId) !== -1) {
              teamLength--
            }
          })
          ret[tc] = {
            createdAt: moment(team.createdAt).format('MM/DD/YY'),
            members: teamLength,
            orders: 1,
            lastOrder: moment(order.orderedAt).format('ddd M/D')
          }
        }
      })
      log.debug(`${days}-day order report: `, ret)
    }
  })
}
