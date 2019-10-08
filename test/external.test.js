/* Copyright (c) 2018 voxgig and other contributors, MIT License */
'use strict'

const Util = require('util')

const Lab = require('@hapi/lab')
const Code = require('@hapi/code')
const lab = (exports.lab = Lab.script())
const expect = Code.expect

const PluginValidator = require('seneca-plugin-validator')
const Seneca = require('seneca')
const Optioner = require('optioner')
const Joi = Optioner.Joi

const Plugin = require('..')

lab.test('validate', PluginValidator(Plugin, module))

lab.test('happy', async () => {
  // internal client
  const c0 = seneca_instance({ tag: 'c0', external: { secret: '1234' } })
    .client()
    .message('a:1', async function(msg) {
      return await this.post({ b: 1, x: msg.x })
    })

  // the browser
  const c1 = Seneca({ tag: 'c1', legacy: { transport: false } })
    .quiet()
    .use('promisify')
    .client()
    .message('a:1', async function(msg) {
      return await this.post({ b: 1, x: msg.x })
    })

  const c2 = seneca_instance({ tag: 'c2', external: { secret: '6789' } })
    .client()
    .message('a:1', async function(msg) {
      return await this.post({ b: 1, x: msg.x })
    })

  const s0 = seneca_instance({
    tag: 's0',
    external: { secret: '1234', pin: 'c:1' }
  })
    .listen()
    .message('b:1', async function(msg) {
      return { b: 1, x: msg.x }
    })
    .message('c:1', async function(msg) {
      // verify internal msgs are allowed once past safe check
      // external.allow = true
      return await this.post({ d: 1, x: msg.x })
    })
    .message('d:1', async function(msg) {
      return { c: 1, x: msg.x }
    })

  await c0.ready()
  await c1.ready()
  await c2.ready()
  await s0.ready()

  expect(s0.export('external').allow.toString()).equal('c=1 -> <true>')

  expect(await s0.post('b:1,x:1')).equal({ b: 1, x: 1 })
  expect(await s0.post('c:1,x:2')).equal({ c: 1, x: 2 })

  // c0 has secret, so everything allowed
  expect(await c0.post('b:1,x:3')).equal({ b: 1, x: 3 })
  expect(await c0.post('c:1,x:4')).equal({ c: 1, x: 4 })
  expect(await c0.post('a:1,x:5')).equal({ b: 1, x: 5 })

  // no secret, and b:1 is not whitelisted - standard browser rejection
  try {
    await c1.post('b:1,x:100')
    expect(true).false()
  } catch (e) {
    expect(e.code).equal('external-not-allowed')
  }

  // no secret, but c:1 is whitelisted
  expect(await c1.post('c:1,x:101')).equal({ c: 1, x: 101 })

  // bad secret always fails

  try {
    await c2.post('b:1,x:200')
    expect(true).false()
  } catch (e) {
    expect(e.code).equal('external-bad-secret')
  }

  try {
    await c2.post('c:1,x:201')
    expect(true).false()
  } catch (e) {
    expect(e.code).equal('external-bad-secret')
  }

  // remote unsafe fails
  try {
    await c1.post('b:1,x:7')
    expect(true).false()
  } catch (e) {
    expect(e.code).equal('external-not-allowed')
  }

  try {
    await c2.post('b:1,x:7')
    expect(true).false()
  } catch (e) {
    expect(e.code).equal('external-bad-secret')
  }

  // good secret, whitelisted unmarked passes
  expect(await c0.post('c:1,x:8')).equal({ c: 1, x: 8 })

  // whitelisted passes - this is the standard browser case
  expect(await c1.post('c:1,x:8')).equal({ c: 1, x: 8 })
})

lab.test('remote-to-local', async () => {
  const c00 = seneca_instance({
    tag: 'c00',
    external: { secret: 'not-needed' }
  })
    .client({ port: 45454, pins: ['b:1'] })
    .message('a:1', async function(msg) {
      return await this.post({ b: 1, k: 1, x: msg.x })
    })

  const c01 = seneca_instance({ tag: 'c01' })
    .client({ port: 45454, pins: ['b:*'] })
    .message('a:1', async function(msg) {
      return await this.post({ b: 1, k: 1, x: msg.x })
    })

  const s00 = seneca_instance({ tag: 's00', external: { pins: ['b:1'] } })
    .listen({ port: 45454 })
    .message('b:1', async function(msg, meta) {
      return await this.post({ c: 1, x: msg.x })
    })
    .message('c:1', async function(msg, meta) {
      return await { y: 1, x: msg.x }
    })

  var out0 = await c00.post('a:1,x:99')
  expect(out0).equal({ y: 1, x: 99 })

  var out1 = await c01.post('a:1,x:99')
  expect(out0).equal({ y: 1, x: 99 })

  const c10 = seneca_instance({ tag: 'c10' })
    .client({ port: 45455, pins: ['b:1'] })
    .message('a:1', async function(msg) {
      return await this.post({ b: 1, k: 1, x: msg.x })
    })

  const c11 = seneca_instance({ tag: 'c11' })
    .client({ port: 45455, pins: ['b:*'] })
    .message('a:1', async function(msg) {
      return await this.post({ b: 1, k: 1, x: msg.x })
    })

  const s01 = seneca_instance({ tag: 's01', external: { pins: ['k:1'] } })
    .listen({ port: 45455 })
    .message('b:1', async function(msg, meta) {
      return await this.post({ c: 1, x: msg.x })
    })
    .message('c:1', async function(msg, meta) {
      return await { y: 1, x: msg.x }
    })

  var out2 = await c10.post('a:1,x:99')
  expect(out0).equal({ y: 1, x: 99 })

  var out3 = await c11.post('a:1,x:99')
  expect(out0).equal({ y: 1, x: 99 })

  c00.close()
  c01.close()
  s00.close()
  s01.close()
})

lab.test('secret_allows', async () => {
  const c00 = seneca_instance({ tag: 'c00', external: { secret: '1234' } })
    .client({ port: 45456, pins: ['k:1'] })
    .message('a:1', async function(msg) {
      return await this.post({ c: 1, k: 1, x: msg.x })
    })
    .message('b:1', async function(msg) {
      return await this.post({ d: 1, k: 1, x: msg.x })
    })

  const c01 = seneca_instance({ tag: 'c01' })
    .client({ port: 45456, pins: ['k:1'] })
    .message('a:1', async function(msg) {
      return await this.post({ c: 1, k: 1, x: msg.x })
    })
    .message('b:1', async function(msg) {
      return await this.post({ d: 1, k: 1, x: msg.x })
    })

  const s00 = seneca_instance({
    tag: 's00',
    external: {
      pins: ['c:1'],
      secret: '1234',
      secret_allows: true
    }
  })
    .listen({ port: 45456 })
    .message('c:1', async function(msg, meta) {
      return await this.post({ e: 1, x: msg.x })
    })
    .message('d:1', async function(msg, meta) {
      return await this.post({ e: 1, x: msg.x })
    })
    .message('e:1', async function(msg, meta) {
      return await { y: 1, x: msg.x }
    })

  // c:1 allowed, secret not needed
  var out0 = await c00.post('a:1,x:98')
  expect(out0).equals({ y: 1, x: 98 })

  // secret needed
  var out1 = await c00.post('b:1,x:97')
  expect(out1).equals({ y: 1, x: 97 })

  // c:1 allowed, secret not needed
  var out2 = await c01.post('a:1,x:96')
  expect(out2).equals({ y: 1, x: 96 })

  // secret not found
  try {
    await c01.post('b:1,x:95')
    Code.fail()
  } catch (e) {
    expect(e.code).equal('external-not-allowed')
  }

  c00.close()
  c01.close()
  s00.close()
})

lab.test('secret_check', async () => {
  var tmp = {}

  var si = seneca_instance({ external: { secret_required: true } })
  si.options({ debug: { undead: true } })
  si.error(function(err) {
    tmp.err = err
  })
  await si.ready()

  expect(tmp.err.code).equal('no_secret')
})

lab.test('secret_required', async () => {
  const c00 = seneca_instance({ tag: 'c00', external: { secret: '1234' } })
    .client({ port: 45457, pins: ['k:1'] })
    .message('a:1', async function(msg) {
      return await this.post({ c: 1, k: 1, x: msg.x })
    })
    .message('b:1', async function(msg) {
      return await this.post({ d: 1, k: 1, x: msg.x })
    })

  const c01 = seneca_instance({ tag: 'c01' })
    .client({ port: 45457, pins: ['k:1'] })
    .message('a:1', async function(msg) {
      return await this.post({ c: 1, k: 1, x: msg.x })
    })
    .message('b:1', async function(msg) {
      return await this.post({ d: 1, k: 1, x: msg.x })
    })

  const s00 = seneca_instance({
    tag: 's00',
    external: {
      pins: ['c:1'],
      secret: '1234',
      secret_allows: true,
      secret_required: true
    }
  })
    .listen({ port: 45457 })
    .message('c:1', async function(msg, meta) {
      return await this.post({ e: 1, x: msg.x })
    })
    .message('d:1', async function(msg, meta) {
      return await this.post({ e: 1, x: msg.x })
    })
    .message('e:1', async function(msg, meta) {
      return await { y: 1, x: msg.x }
    })

  // c:1 allowed, with secret
  var out0 = await c00.post('a:1,x:98')
  expect(out0).equals({ y: 1, x: 98 })

  // secret needed
  var out1 = await c00.post('b:1,x:97')
  expect(out1).equals({ y: 1, x: 97 })

  // c:1 not allowed, secret needed
  try {
    await c01.post('a:1,x:96')
    Code.fail()
  } catch (e) {
    expect(e.code).equal('external-secret-required')
  }

  // secret not found
  try {
    await c01.post('b:1,x:95')
    Code.fail()
  } catch (e) {
    expect(e.code).equal('external-secret-required')
  }

  c00.close()
  c01.close()
  s00.close()
})

lab.test('seneca-hapi', async () => {
  var si = Seneca({ legacy: { transport: false } })
    .quiet()
    .use('promisify')
    .use('hapi')
    .use(Plugin, { pins: ['role:public'] })
    .message('role:public,a:1', async function(msg, meta) {
      return await { y: 1, x: msg.x }
    })

  await si.ready()

  var handler = si.export('hapi/action_handler')
  var out = await handler({ payload: '{"role":"public","a":1,"x":100}' }, {})
  expect(out).contains({ y: 1, x: 100 })
})

function seneca_instance(config) {
  return (
    Seneca({ tag: config.tag, legacy: { transport: false } })
      //.test('print')
      .quiet()
      .use('promisify')
      .use(Plugin, config.external)
  )
}
