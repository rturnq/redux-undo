let { expect } = require('chai')
let { default: undoable, ActionCreators } = require('../src/index')

describe('Undoable', () => {
  let mockUndoableReducer
  let mockInitialState
  let incrementedState
  let suspendedStates
  let resumedState

  before('setup mock reducers and states', () => {
    let countInitialState = 0
    let countReducer = (state = countInitialState, action = {}) => {
      switch (action.type) {
        case 'INCREMENT':
          return state + 1
        case 'DECREMENT':
          return state - 1
        default:
          return state
      }
    }
    let undoConfig = {
      limit: 100,
      initTypes: 'RE-INITIALIZE',
      filter: function (action) {
        switch (action.type) {
          case 'DECREMENT':
            return false
          default:
            return true
        }
      }
    }
    mockUndoableReducer = undoable(countReducer, undoConfig)
    mockInitialState = mockUndoableReducer(void 0, {})
    incrementedState = mockUndoableReducer(mockInitialState, { type: 'INCREMENT' })
    suspendedStates = []
    resumedState = [
      ActionCreators.suspend(),
      { type: 'INCREMENT' },
      ActionCreators.suspend(),
      { type: 'INCREMENT' },
      { type: 'INCREMENT' },
      ActionCreators.resume(),
      { type: 'INCREMENT' },
      ActionCreators.resume()
    ].reduce((state, action) => {
      let nextState = mockUndoableReducer(state, action)
      suspendedStates.push(nextState)
      return nextState
    }, mockInitialState)
  })

  it('should wrap its old history', () => {
    let doubleIncrementedState = mockUndoableReducer(incrementedState, { type: 'INCREMENT' })

    expect(incrementedState.history.history).to.deep.equal(mockInitialState.history)
    expect(doubleIncrementedState.history.history).to.deep.equal(incrementedState.history)
  })

  it('should not record unwanted actions', () => {
    let decrementedState = mockUndoableReducer(mockInitialState, { type: 'DECREMENT' })

    expect(decrementedState.history.past).to.deep.equal(mockInitialState.history.past)
    expect(decrementedState.history.future).to.deep.equal(mockInitialState.history.future)
  })
  it('should reset upon init actions', () => {
    let doubleIncrementedState = mockUndoableReducer(incrementedState, { type: 'INCREMENT' })
    let reInitializedState = mockUndoableReducer(doubleIncrementedState, { type: 'RE-INITIALIZE' })

    expect(reInitializedState.past.length).to.equal(0)
    expect(reInitializedState.future.length).to.equal(0)
  })

  describe('Undo', () => {
    let undoState
    let multiUndoState
    before('perform an undo action', () => {
      undoState = mockUndoableReducer(incrementedState, ActionCreators.undo())
      multiUndoState = mockUndoableReducer(resumedState, ActionCreators.undo())
    })
    it('should change present state back by one action', () => {
      expect(undoState.present).to.equal(mockInitialState.present)
      expect(multiUndoState.present).to.equal(mockInitialState.present)
    })
    it('should change present state to first element of \'past\'', () => {
      expect(undoState.present).to.equal(incrementedState.past[0])
    })
    it('should add a new element to \'future\' from last state', () => {
      expect(undoState.future[0]).to.equal(incrementedState.present)
    })
    it('should decrease length of \'past\' by one', () => {
      expect(undoState.past.length).to.equal(incrementedState.past.length - 1)
    })
    it('should increase length of \'future\' by one', () => {
      expect(undoState.future.length).to.equal(incrementedState.future.length + 1)
    })
    it('should do nothing if \'past\' is empty', () => {
      let undoInitialState = mockUndoableReducer(mockInitialState, ActionCreators.undo())
      expect(mockInitialState.past.length).to.equal(0)
      expect(undoInitialState.history).to.deep.equal(mockInitialState)
      expect(undoInitialState.present).to.deep.equal(mockInitialState.present)
    })
  })
  describe('Redo', () => {
    let undoState
    let redoState
    let multiUndoState
    let multiRedoState
    before('perform an undo action then a redo action', () => {
      undoState = mockUndoableReducer(incrementedState, ActionCreators.undo())
      redoState = mockUndoableReducer(undoState, ActionCreators.redo())
      multiUndoState = mockUndoableReducer(resumedState, ActionCreators.undo())
      multiRedoState = mockUndoableReducer(multiUndoState, ActionCreators.redo())
    })
    it('should change present state to equal state before undo', () => {
      expect(redoState.present).to.equal(incrementedState.present)
      expect(multiRedoState.present).to.equal(resumedState.present)
    })
    it('should change present state to first element of \'future\'', () => {
      expect(redoState.present).to.equal(undoState.future[0])
    })
    it('should add a new element to \'past\' from last state', () => {
      expect(redoState.past[0]).to.equal(undoState.present)
    })
    it('should decrease length of \'future\' by one', () => {
      expect(redoState.future.length).to.equal(undoState.future.length - 1)
    })
    it('should increase length of \'past\' by one', () => {
      expect(redoState.past.length).to.equal(undoState.past.length + 1)
    })
    it('should do nothing if \'future\' is empty', () => {
      let secondRedoState = mockUndoableReducer(redoState, ActionCreators.redo())

      expect(redoState.future.length).to.equal(0)
      expect(secondRedoState.history).to.deep.equal(redoState)
      expect(secondRedoState.present).to.deep.equal(redoState.present)
    })
  })
  describe('Suspend', () => {
    let firstSuspendedState
    let secondSuspendedState
    before('suspend state tracking', () => {
      firstSuspendedState = suspendedStates[0]
      secondSuspendedState = suspendedStates[2]
    })
    it('should increment \'suspendCount\' by one', () => {
      expect(firstSuspendedState.suspendCount).to.equal(1)
      expect(secondSuspendedState.suspendCount).to.equal(2)
    })
    it('should append \'present\' to \'past\' when suspendCount goes from 0 to 1', () => {
      expect(firstSuspendedState.past.length).to.equal(mockInitialState.past.length + 1)
      expect(firstSuspendedState.past[firstSuspendedState.past.length - 1]).to.equal(mockInitialState.present)
      expect(secondSuspendedState.past).to.equal(firstSuspendedState.past)
    })
    it('should prevent tracking state changes', () => {
      expect(resumedState.past.length).to.equal(1)
      expect(resumedState.past[0]).to.equal(mockInitialState.present)
      expect(resumedState.present).to.equal(4)
    })
  })
  describe('Resume', () => {
    let firstResumedState
    let secondResumedState
    before('suspend state tracking', () => {
      firstResumedState = suspendedStates[5]
      secondResumedState = suspendedStates[7]
    })
    it('should decrement \'suspendCount\' by one', () => {
      expect(firstResumedState.suspendCount).to.equal(1)
      expect(secondResumedState.suspendCount).to.equal(0)
    })
    it('should set \'present\' to the last \'past\' state when passed `true`', () => {
      let resumedState = mockUndoableReducer(suspendedStates[1], ActionCreators.resume(true))
      expect(resumedState.present).to.equal(mockInitialState.present)
    })
    it('should set \'present\' to the last \'past\' state when no state changes occured', () => {
      let resumedState = mockUndoableReducer(suspendedStates[0], ActionCreators.resume())
      expect(resumedState.present).to.equal(mockInitialState.present)
    })
    it('should do nothing when there is no corresponding \'suspend\' call', () => {
      let resumedState = mockUndoableReducer(mockInitialState, ActionCreators.resume())
      expect(mockInitialState.past.length).to.equal(0)
      expect(resumedState.history).to.deep.equal(mockInitialState)
      expect(resumedState.present).to.deep.equal(mockInitialState.present)
    })
    it('should resume tracking state changes', () => {
      let incrementedState = mockUndoableReducer(resumedState, { type: 'INCREMENT' })
      expect(incrementedState.past.length).to.equal(resumedState.past.length + 1)
      expect(incrementedState.past[incrementedState.past.length - 1]).to.equal(resumedState.present)
    })
  })
})
