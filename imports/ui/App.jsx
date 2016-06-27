import React, { Component } from 'react'
import { createContainer } from 'meteor/react-meteor-data'

import AddUserToTeamsForm from './AddUserToTeamsForm'

class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      importType: 'addToTeams'
    }
  }

  render() {
    return (
      <div className="container">
        <header>
          <h1>Sous</h1>
        </header>
        <AddUserToTeamsForm/>
      </div>
    )
  }
}

export default createContainer(() => {
  return {
    currentUser: Meteor.user(),
  }
}, App)