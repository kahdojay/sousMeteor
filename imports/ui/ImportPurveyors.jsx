import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { Meteor } from 'meteor/meteor';

export default class ImportPurveyors extends Component {
  handleSubmit(e) {
    e.preventDefault();
    console.log('importingpurveyors')
    let teamCode = ReactDOM.findDOMNode(this.refs.teamCode)

    Meteor.call('importPurveyors', teamCode.value.trim().toUpperCase(), (err, res) => {
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
              teamCode purveyors to import (leave blank for entire sheet):
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