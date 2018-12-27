/* Copyright (c) 2018 voxgig and other contributors, MIT License */
'use strict'


const Util = require('util')


module.exports = external

external.defaults = {
  pins: []
}

function external(options) {

  // TODO: needs to be a seneca feature
  intern.error = this.util.Eraro({
    package: 'seneca',
    override: true,
    msgmap: external.errors
  })
  
  // only allow messages where custom.secret matches
  const secret = options.secret
  
  // normalize the list of pins
  var pins = options.pin || options.pins
  pins = Array.isArray(pins) ? pins : pins.split(/\s*;\s*/)
  pins = pins.map(pin => this.util.Jsonic(pin))

  const allow = this.util.Patrun({ gex: true })
  pins.forEach(pin => allow.add(pin, true))

  this.prepare(async function() {
    // TODO: seneca.has needs test and fix
    if(this.private$.actrouter.find({role:'web-handler',hook:'custom'}, true)) {
      await this.post({
        role:'web-handler',hook:'custom',
        custom: function(custom) {
          custom.external = custom.external || {}
          custom.external.safe = false
        }
      })
    }
    
    // NOTE: must follow handling of message custom meta data
    this.inward(function(ctxt, data) {
      const remote = data.meta.remote
      const external = data.meta.custom.external = data.meta.custom.external || {}
      
      // Allow any message if it originated locally
      if(remote) {
        external.safe = false
        external.allow = false
      }
      else {
        Object.assign(external,{
          safe: true,
          allow: true,
          secret: secret,
          origin: ctxt.seneca.id
        },external)
        return
      }

      // Disallow message if secrets don't match.
      if( null != external.secret && null != secret) {
        if( external.secret === secret) {
          external.allow = true
        }
        else {
          return {
            kind: 'error',
            code: 'external-bad-secret'
          }
        }
      }
        
      // Allow messages if parent is allowed
      if( external.allow ) {
        return
      }

      if(allow.find(data.msg)) {
        external.allow = true
        return
      }
      else {
        return {
          kind: 'error',
          code: 'external-not-allowed'
        }
      }
    })
  })
  
  return {
    export: {
      allow: allow
    }
  }
}

external.errors = {
}

const intern = external.intern = {
}




