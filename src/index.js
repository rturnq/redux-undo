// debug output
let __DEBUG__
function debug (...args) {
  if (__DEBUG__) {
    if (!console.group) {
      args.unshift('%credux-undo', 'font-style: italic')
    }
    console.log(...args)
  }
}
function debugStart (action, state) {
  if (__DEBUG__) {
    const args = ['action', action.type]
    if (console.group) {
      args.unshift('%credux-undo', 'font-style: italic')
      console.groupCollapsed(...args)
      console.log('received', {state, action})
    } else {
      debug(...args)
    }
  }
}
function debugEnd () {
  if (__DEBUG__) {
    return console.groupEnd && console.groupEnd()
  }
}
// /debug output

// action types
export const ActionTypes = {
  UNDO: '@@redux-undo/UNDO',
  REDO: '@@redux-undo/REDO',
  JUMP_TO_FUTURE: '@@redux-undo/JUMP_TO_FUTURE',
  JUMP_TO_PAST: '@@redux-undo/JUMP_TO_PAST',
  SUSPEND: '@@redux-undo/SUSPEND',
  RESUME: '@@redux-undo/RESUME'
}
// /action types

// action creators to change the state
export const ActionCreators = {
  undo () {
    return { type: ActionTypes.UNDO }
  },
  redo () {
    return { type: ActionTypes.REDO }
  },
  jumpToFuture (index) {
    return { type: ActionTypes.JUMP_TO_FUTURE, index }
  },
  jumpToPast (index) {
    return { type: ActionTypes.JUMP_TO_PAST, index }
  },
  suspend () {
    return { type: ActionTypes.SUSPEND }
  },
  resume (revert) {
    return { type: ActionTypes.RESUME, revert }
  }
}
// /action creators

// length: get length of history
function length (history) {
  const { past, future } = history
  return past.length + 1 + future.length
}
// /length

// insert: insert `state` into history, which means adding the current state
//         into `past`, setting the new `state` as `present` and erasing
//         the `future`.
function insert (history, state, limit) {
  debug('insert', {state, history, free: limit - length(history)})

  const { past, present, suspendCount } = history
  const historyOverflow = limit && length(history) >= limit

  if (present === undefined) {
    // init history
    return {
      past: [],
      present: state,
      future: [],
      suspendCount
    }
  }

  return {
    past: [
      ...past.slice(historyOverflow ? 1 : 0),
      present
    ],
    present: state,
    future: [],
    suspendCount
  }
}
// /insert

// undo: go back to the previous point in history
function undo (history) {
  debug('undo', {history})

  const { past, present, future, suspendCount } = history

  if (past.length <= 0) return history

  return {
    past: past.slice(0, past.length - 1), // remove last element from past
    present: past[past.length - 1], // set element as new present
    future: [
      present, // old present state is in the future now
      ...future
    ],
    suspendCount
  }
}
// /undo

// redo: go to the next point in history
function redo (history) {
  debug('redo', {history})

  const { past, present, future, suspendCount } = history

  if (future.length <= 0) return history

  return {
    future: future.slice(1, future.length), // remove element from future
    present: future[0], // set element as new present
    past: [
      ...past,
      present // old present state is in the past now
    ],
    suspendCount
  }
}
// /redo

// jumpToFuture: jump to requested index in future history
function jumpToFuture (history, index) {
  if (index === 0) return redo(history)

  const { past, present, future, suspendCount } = history

  return {
    future: future.slice(index + 1),
    present: future[index],
    past: past.concat([present])
              .concat(future.slice(0, index)),
    suspendCount
  }
}
// /jumpToFuture

// jumpToPast: jump to requested index in past history
function jumpToPast (history, index) {
  if (index === history.past.length - 1) return undo(history)

  const { past, present, future, suspendCount } = history

  return {
    future: past.slice(index + 1)
                .concat([present])
                .concat(future),
    present: past[index],
    past: past.slice(0, index),
    suspendCount
  }
}
// /jumpToPast

// suspend: prevent tracking history until resumeUndo
function suspend (history) {
  const { past, present, future, suspendCount } = history

  return {
    future: future,
    present: present,
    past: past,
    suspendCount: suspendCount + 1
  }
}
// /suspend

// resume: resume tracking history and revert if needed
function resume (history, revert) {
  // Restore was called without a matching suspend action, don't change the state
  if (history.suspendCount < 1) return history

  const { past, present, future, suspendCount } = history

  if (revert || present === past[past.length - 1]) {
    // Restore was called without the state being changed since the suspend
    // call, or we explicity  want to revert, we need to remove the history
    // element added for the suspend action
    return {
      past: past.slice(0, past.length - 1), // remove last element from past
      present: past[past.length - 1], // set element as new present
      future: future, // don't change future - throw away reverted state
      suspendCount: suspendCount - 1
    }
  }

  return {
    future: future,
    present: present,
    past: past,
    suspendCount: suspendCount - 1
  }
}
// /resume

// wrapState: for backwards compatibility to 0.4
function wrapState (state) {
  return {
    ...state,
    history: state
  }
}
// /wrapState

// updateState
function updateState (state, history) {
  return wrapState({
    ...state,
    ...history
  })
}
// /updateState

// createHistory
function createHistory (state) {
  return {
    past: [],
    present: state,
    future: [],
    suspendCount: 0
  }
}
// /createHistory

// parseActions
export function parseActions (rawActions, defaultValue = []) {
  if (Array.isArray(rawActions)) {
    return rawActions
  } else if (typeof rawActions === 'string') {
    return [rawActions]
  }
  return defaultValue
}
// /parseActions

// redux-undo higher order reducer
export default function undoable (reducer, rawConfig = {}) {
  __DEBUG__ = rawConfig.debug

  const config = {
    initialState: rawConfig.initialState,
    initTypes: parseActions(rawConfig.initTypes, ['@@redux/INIT', '@@INIT']),
    limit: rawConfig.limit,
    filter: rawConfig.filter || (() => true),
    undoType: rawConfig.undoType || ActionTypes.UNDO,
    redoType: rawConfig.redoType || ActionTypes.REDO,
    jumpToPastType: rawConfig.jumpToPastType || ActionTypes.JUMP_TO_PAST,
    jumpToFutureType: rawConfig.jumpToFutureType || ActionTypes.JUMP_TO_FUTURE,
    suspendType: rawConfig.suspend || ActionTypes.SUSPEND,
    resumeType: rawConfig.resume || ActionTypes.RESUME
  }
  config.history = rawConfig.initialHistory || createHistory(config.initialState)

  if (config.initTypes.length === 0) {
    console.warn('redux-undo: supply at least one action type in initTypes to ensure initial state')
  }

  return (state, action) => {
    debugStart(action, state)
    let res
    switch (action.type) {
      case config.undoType:
        res = undo(state)
        debug('after undo', res)
        debugEnd()
        return res ? updateState(state, res) : state

      case config.redoType:
        res = redo(state)
        debug('after redo', res)
        debugEnd()
        return res ? updateState(state, res) : state

      case config.jumpToPastType:
        res = jumpToPast(state, action.index)
        debug('after jumpToPast', res)
        debugEnd()
        return res ? updateState(state, res) : state

      case config.jumpToFutureType:
        res = jumpToFuture(state, action.index)
        debug('after jumpToFuture', res)
        debugEnd()
        return res ? updateState(state, res) : state

      case config.suspendType:
        res = suspend(state)
        if (!state.suspendCount) {
          // if tracking is not suspended, we still need to update the history
          // so we can revert back to this point
          res = insert(res, res.present, config.limit)
        }
        debug('after suspend', res)
        debugEnd()
        return res ? updateState(state, res) : state

      case config.resumeType:
        res = resume(state, action.revert)
        debug('after resume', res)
        debugEnd()
        return res ? updateState(state, res) : state

      default:
        res = reducer(state && state.present, action)

        if (config.initTypes.some((actionType) => actionType === action.type)) {
          debug('reset history due to init action')
          debugEnd()
          return wrapState({
            ...state,
            ...createHistory(res)
          })
        }

        if (config.filter && typeof config.filter === 'function') {
          if (!config.filter(action, res, state && state.present)) {
            debug('filter prevented action, not storing it')
            debugEnd()
            return wrapState({
              ...state,
              present: res
            })
          }
        }

        if (state && state.suspendCount) {
          debug('tracking is suspended, not storing it')
          debugEnd()
          return wrapState({
            ...state,
            present: res
          })
        }

        const history = (state && state.present !== undefined) ? state : config.history
        const updatedHistory = insert(history, res, config.limit)
        debug('after insert', {history: updatedHistory, free: config.limit - length(updatedHistory)})
        debugEnd()

        return wrapState({
          ...state,
          ...updatedHistory
        })
    }
  }
}
// /redux-undo

// distinctState helper
export function distinctState () {
  return (action, currentState, previousState) => currentState !== previousState
}
// /distinctState

// includeAction helper
export function includeAction (rawActions) {
  const actions = parseActions(rawActions)
  return (action) => actions.indexOf(action.type) >= 0
}
// /includeAction

// deprecated ifAction helper
export function ifAction (rawActions) {
  console.error('Deprecation Warning: Please change `ifAction` to `includeAction`')
  return includeAction(rawActions)
}
// /ifAction

// excludeAction helper
export function excludeAction (rawActions = []) {
  const actions = parseActions(rawActions)
  return (action) => actions.indexOf(action.type) < 0
}
// /excludeAction
