import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { Meteor } from 'meteor/meteor';

export default class ImportProducts extends Component {
  handleSubmit(e) {
    e.preventDefault();

    let teamCode = ReactDOM.findDOMNode(this.refs.teamCode)
    const teamCodeParam = teamCode.value.trim() ? teamCode.value.trim().toUpperCase() : 'all'

    Meteor.call('importProducts', teamCodeParam, (err, res) => {
      if (!err) {
        teamCode.value = ''
      } else {
        // method error
      }
    })
  }

  render() {
    return (
      <div>
        <form 
          onSubmit={this.handleSubmit.bind(this)} 
        >
          <div>
            <label className="team-code">
              teamCode products to import (leave blank for entire sheet):
              <input
                ref="teamCode"
              />
            </label>
          </div>
          <button type="submit">Submit</button>
        </form>
      </div>
    )
  }
}