/* Copyright (c) 2018 voxgig and other contributors, MIT License */
'use strict'

const Util = require('util')

const Lab = require('lab')
const Code = require('code')
const lab = (exports.lab = Lab.script())
const expect = Code.expect

const PluginValidator = require('seneca-plugin-validator')
const Seneca = require('seneca')
const Optioner = require('optioner')
const Joi = Optioner.Joi

const Plugin = require('..')


lab.test('validate', Util.promisify(function(x,fin){PluginValidator(Plugin, module)(fin)}))


lab.test('happy', async () => {
  const c0 = seneca_instance({external:{secret:'1234'}})
        .client()
        .message('a:1', async function(msg) {
          return await this.post({b: 1, x: msg.x})
        })

  const c1 = Seneca({legacy:{transport:false}})
        //.test('print')
        .quiet()
        .use('promisify')
        .client()
        .message('a:1', async function(msg) {
          return await this.post({b: 1, x: msg.x})
        })

  const c2 = seneca_instance({external:{secret:'6789'}})
        .client()
        .message('a:1', async function(msg) {
          return await this.post({b: 1, x: msg.x})
        })

  
  const s0 = seneca_instance({external:{secret:'1234',pin:'c:1'}})
        .listen()
        .message('b:1', async function(msg) {
          return {b: 1, x: msg.x}
        })
        .message('c:1', async function(msg) {
          // verify internal msgs are allowed once past safe check
          // external.allow = true
          return await this.post({d: 1, x: msg.x})
        })
        .message('d:1', async function(msg) {
          return {c: 1, x: msg.x}
        })

  await c0.ready()
  await c1.ready()
  await c2.ready()
  await s0.ready()

  expect(s0.export('external').allow.toString()).equal('c=1 -> <true>')
  
  expect( await s0.post('b:1,x:1') ).equal({b: 1, x: 1})
  expect( await s0.post('c:1,x:2') ).equal({c: 1, x: 2})

  expect( await c0.post('b:1,x:3') ).equal({b: 1, x: 3})
  expect( await c0.post('c:1,x:4') ).equal({c: 1, x: 4})
  expect( await c0.post('a:1,x:5') ).equal({b: 1, x: 5})

  
  // no secret, and b:1 is not whitelisted
  try {
    await c1.post('b:1,x:100')
    expect(true).false()
  } catch(e) {
    expect(e.code).equal('external-not-allowed')
  }
  
  // no secret, but c:1 is whitelisted
  expect(await c1.post('c:1,x:101')).equal({c:1,x:101})

  
  // bad secret always fails

  try {
    await c2.post('b:1,x:200')
    expect(true).false()
  } catch(e) {
    expect(e.code).equal('external-bad-secret')
  }

  try {
    await c2.post('c:1,x:201')
    expect(true).false()
  } catch(e) {
    expect(e.code).equal('external-bad-secret')
  }

  
  
  // marked safe passes
  expect( await c0.post('b:1,x:6',{custom$:{external:{safe:true}}}) ).equal({b: 1, x: 6})

  
  // marked unsafe fails
  try {
    await c0.post('b:1,x:7',{custom$:{external:{safe:false}}})
    expect(true).false()
  } catch(e) {
    expect(e.code).equal('external-not-allowed')
  }


  // good secret, whitelisted unmarked passes
  expect( await c0.post('c:1,x:8') ).equal({c: 1, x: 8})
  
  // marked unsafe but whitelisted passes - this is the standard browser case
  expect( await c0.post('c:1,x:8',{custom$:{external:{safe:false}}}) ).equal({c: 1, x: 8})
})



function seneca_instance(config) {
  return Seneca({legacy:{transport:false}})
    //.test('print')
    .quiet()
    .use('promisify')
    .use(Plugin, config.external)
}
