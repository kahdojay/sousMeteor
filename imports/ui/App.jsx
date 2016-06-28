import React, { Component } from 'react'
import { createContainer } from 'meteor/react-meteor-data'

import AddUserToTeamsForm from './AddUserToTeamsForm'
import AuthForm from './AuthForm'

class App extends Component {
  constructor(props) {
    super(props)

    this.state = {
      importType: 'addToTeams',
      authenticated: false
    }
  }

  submitPass(pass) {
    Meteor.call('submitPass', pass, (err, res) => {
      if (res === true) {
        this.setState({ authenticated: true })
      }
    })
  }

  render() {
    var ShowForm = this.state.authenticated ? AddUserToTeamsForm : AuthForm

    return (
      <div className="container">
        <header>
          <h1>Sous</h1>
        </header>
        <ShowForm
          submitPass={this.submitPass.bind(this)}
        />
      </div>
    )
  }
}

export default createContainer(() => {
  return {
    currentUser: Meteor.user(),
  }
}, App)