if(Meteor.isServer){
  Meteor.methods({
    reportOrders: function(days = 7) {
      var ret = {}
      Teams.find({teamCode: {$not: /(DEMO|DEV)/}, betaAccess: {$exists: true}, active: {$not: /FALSE/}}).fetch().forEach(function(team) {
        var mostRecentOrder = Orders.findOne({teamCode: team.teamCode}, {sort: {orderedAt: -1}})
        ret[team.teamCode] = {
          orders: 0,
          lastOrder: mostRecentOrder ? moment(mostRecentOrder.orderedAt).format('ddd M/D') : 'N/A'
        }
      })
      Orders.find({teamCode: {$not: /(DEMO|DEV)/}, createdAt: {$gte: moment().subtract(days, 'days').toISOString()}}, {sort: {orderedAt: 1}}).fetch().forEach(function(order) {
        var tc = order.teamCode
        if(ret[tc] !== undefined){
          ret[tc] = {
            orders: ret[tc].orders + 1,
            lastOrder: moment(order.orderedAt).format('ddd M/D')
          }
        } else {
          ret[tc] = {
            orders: 1,
            lastOrder: moment(order.orderedAt).format('ddd M/D')
          }
        }
      })
      log.debug(`${days}-day order report: `, ret)
    }
  })
}