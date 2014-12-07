var Component = require('component');
var Omniscient = require('omniscient');
var ReactRouter = require('react-router');

var sharedMixins = {
  'rr.State': ReactRouter.State,
  'rr.RouteHandler': ReactRouter.RouteHandlerMixin
};

// shared mixins
Component.addDecorator(spec => {
  if (spec.mixins)
    spec.mixins = spec.mixins.map(mixin =>
      (typeof mixin === 'string') ? sharedMixins[mixin] : mixin);

  return spec;
});

// global mixins
Component.addDecorator(spec => {
  spec.mixins = [
    { shouldComponentUpdate: Omniscient.shouldComponentUpdate }
  ].concat(spec.mixins);
  return spec;
});