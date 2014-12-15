var React = require('react');
var Invariant = require('react/lib/invariant');
var UI = require('ui/index');
var StyleKeys = require('ui/lib/StyleKeys');
var AnimateStore = require('ui/stores/AnimateStore');

// This is a somewhat haphazard mixin at the moment that
// organizes and runs animations on elements.

// This mixin works through props, state or the AnimateStore
// The AnimateStore can be used by the Animator mixin, which
// is used by parent components that want to run an animation
// (until contexts pass through parents at least)

// runAnimations() runs a queue of upcoming animations and
// uses requestAnimationFrame for some performance

// For now I'm testing avoiding the react render pipeline.
// I found that with many animations running at once, even
// with a decent amount of optimization you still are doing
// too much work for mobile browsers.

// This still works nicely with React though. You can control
// animations from within a render(), or componentWillUpdate(),
// or anywhere really.

// Animations are passed through props, but are sideloaded with
// the theme you define. UI.setAnimations is a good starting point

// Expects props to be set in the form of animations key, value is
// an array of animation objects.

// An animation object can have the following props:
//   animation (required) {string} - animation function
//   source (optional) {string} - for info from parents
//   name (optional) {string} - can use as an identifier

// other relevant proprties

// - animationProps: for passing in extra info.
//     Must have a key matching with 'source', inside you can
//     add any info you may need in your animation function
// - animationActive: for disabling animations

var defined = variable => (typeof variable !== 'undefined');
var animationQueue = [];

// todo: only run this when we need to
function runAnimations() {
  var i, len = animationQueue.length;
  for (i = 0; i < len; i++) {
    animationQueue[i].setAnimationStyles.call(animationQueue[i]);
  }
  animationQueue = [];
}

module.exports = {
  contextTypes: {
    animateProps: React.PropTypes.object,
    animationsActive: React.PropTypes.bool
  },

  componentWillMount() {
    this.setAnimations();
  },

  componentWillUpdate(nextProps, nextState) {
    this.setAnimations(nextProps, nextState);
  },

  componentWillUnmount() {
    if (this._headStyleTag)
      document.head.removeChild(this._headStyleTag);
  },

  getAnimations(props, state) {
    var animations = [];

    if (typeof props === 'undefined') {
      props = this.props;
      state = this.state;
    }

    if (props.animations && props.animations.length)
      animations = this.props.animations;

    if (state && state.animations && state.animations.length)
      animations = animations.concat(state.animations);

    return animations;
  },

  animationsDisabled() {
    return this.props.animationDisabled || this.context.animationDisabled;
  },

  isAnimating(source) {
    return this._animations && this.getAnimationProps(source).step % 1 !== 0;
  },

  getAnimationProp(animation, animations) {
    animations = animations || this.getAnimations();
    return animations.length && animations.filter(a => a && a.animation === animation);
  },

  hasAnimation(animation, animations) {
    animations = animations || this.getAnimations();
    return animations.length && !!this.getAnimationProp(animation, animations).length;
  },

  getAnimator(animation) {
    return UI.getAnimations(animation);
  },

  setAnimations(props, state) {
    if (typeof props === 'undefined') {
      props = this.props;
      state = this.state;
    }

    var animations = this.getAnimations(props, state);

    if (animations.length) {
      var source;
      this._animations = {};

      animations.forEach(animation => {
        source = animation.source || 'self';
        this._animations[source] = Object.assign({},
          AnimateStore(animation) || {},
          props && props.animateProps && props.animateProps[animation.source] || {},
          source === 'self' && state && { step: state.step, index: state.index }
        );
      });
    }
  },

  getAnimationProps(source) {
    return this._animations[source || 'self'];
  },

  getAnimationStep(source) {
    return this.getAnimationProps(source || 'self').step;
  },

  // experimental: for out of react render
  animate() {
    if (!this.animationsDisabled() && this.getAnimations().length && !this.hasPendingAnimations) {
      animationQueue.push(this);
      this.hasPendingAnimations = true;
      window.requestAnimationFrame(runAnimations);
    }
  },

  // experimental: for out of react render
  setAnimationStyles() {
    this.hasPendingAnimations = false;
    var animations = this.getAnimation();

    if (!animations || this._lifeCycleState !== 'MOUNTED')
      return;

    var node, selector;
    var hasHeadStyleTag = !!this._headStyleTag;

    if (!hasHeadStyleTag) {
      this._headStyleTag = document.createElement('style');
      this._headStyleTag.ref = this._uniqueID;
    }
    else {
      this._headStyleTag.innerHTML = '';
    }

    Object.keys(animations).forEach(key => {
      node = key === 'self' ?
        this.getDOMNode() :
        this.refs[key] && this.refs[key].getDOMNode();

      if (!node)
        return;

      selector = node.id ?
        `#${node.id}` :
        `[data-reactid="${node.getAttribute('data-reactid')}"]`;

      // set tag styles
      this._headStyleTag.innerHTML +=
        `${selector} {
          ${this.stylesToString(animations[key])}
        }`;
    });

    if (!hasHeadStyleTag)
      document.head.appendChild(this._headStyleTag);
  },

  // experimental: for out of react render
  stylesToString(obj) {
    return Object.keys(obj).reduce(
      (acc, key) =>
        `${key}: ${obj[key]};
         ${acc}`,
      '');
  },

  // this is the meat of it, fetches animations and returns an object
  // of animations. key is the ref, value is an object of styles.
  // TODO: make this use RAF and return on every frame
  getAnimation(name) {
    var animations = this.getAnimations();
    var animation, i, len = animations.length;

    if (!len)
      return;

    var styles;

    // loop through animations
    for (i = 0; i < len; i++) {
      animation = animations[i];

      if (!animation || name && name !== animation.name)
        continue;

      // get index, step and props for animation
      var { index, step, ...props } = this.getAnimationProps(animation.source);

      if (!defined(index) && this.state)
        index = this.state.index;

      if (!animation.source && this.getTweeningValue)
        step = this.getTweeningValue('step') || step;

      Invariant(defined(step), 'Must define step for animation to run');
      Invariant(defined(index), 'Must define index for animation to run');

      // get the animator function set in theme
      var animator = this.getAnimator(animation.animation);
      var { scale, rotate, rotate3d, translate, ...other } = animator(index, step, props);

      // set styles
      styles = Object.assign({}, other);
      styles[StyleKeys.TRANSFORM] = this.animationTransformsToString({ scale, rotate, rotate3d, translate });
    }

    return styles;
  },

  animationTransformsToString(transform) {
    if (!transform)
      return;

    var transformString = '';
    var t = transform;

    if (defined(t.scale))
      transformString += `scale(${t.scale}) `;

    if (defined(t.rotate3d))
      transformString += (
        rotate.x ? `rotateX(${t.rotate3d.x || 0}deg)` : '' +
        rotate.y ? `rotateY(${t.rotate3d.y || 0}deg)` : '' +
        rotate.z ? `rotateZ(${t.rotate3d.z || 0}deg)` : ''
      );

    if (defined(t.rotate))
      transformString += `rotate(${t.rotate}deg)`;

    if (defined(t.translate))
      transformString += `translate3d(${t.translate.x || 0}px, ${t.translate.y || 0}px, ${t.translate.z || 0}px)`;

    return transformString || 'translateZ(0px)';
  },

  isSameAnimation(a, b) {
    return a.animation === b.animation && (
      !a.source && !b.source ||
      a.source === b.source
    );
  }
};