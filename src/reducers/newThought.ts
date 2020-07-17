import _ from 'lodash'
import { State } from '../util/initialState'
import { Path } from '../types'

// constants
import {
  RANKED_ROOT,
  TUTORIAL2_STEP_CONTEXT1,
  TUTORIAL2_STEP_CONTEXT1_HINT,
  TUTORIAL2_STEP_CONTEXT1_PARENT,
  TUTORIAL2_STEP_CONTEXT1_PARENT_HINT,
  TUTORIAL2_STEP_CONTEXT2,
  TUTORIAL2_STEP_CONTEXT2_HINT,
  TUTORIAL2_STEP_CONTEXT2_PARENT,
  TUTORIAL2_STEP_CONTEXT2_PARENT_HINT,
  TUTORIAL_STEP_FIRSTTHOUGHT,
  TUTORIAL_STEP_FIRSTTHOUGHT_ENTER,
  TUTORIAL_STEP_SECONDTHOUGHT,
  TUTORIAL_STEP_SECONDTHOUGHT_ENTER,
  TUTORIAL_STEP_SUBTHOUGHT,
} from '../constants'

// util
import {
  contextOf,
  ellipsize,
  headValue,
  pathToContext,
  reducerFlow,
  unroot,
} from '../util'

// selectors
import {
  getNextRank,
  getPrevRank,
  getRankAfter,
  getRankBefore,
  getSetting,
  hasChild,
  isContextViewActive,
  lastThoughtsFromContextChain,
  splitChain,
} from '../selectors'

// reducers
import {
  error,
  newThoughtSubmit,
  setCursor,
  tutorialNext,
  tutorialStep as tutorialStepReducer,
} from '../reducers'

interface Payload {
  at?: Path,
  insertNewSubthought?: boolean,
  insertBefore?: boolean,
  value?: string,
  offset?: number,
  preventSetCursor?: boolean,
}

/** Adds a new thought to the cursor. NOOP if the cursor is not set.
 *
 * @param offset The focusOffset of the selection in the new thought. Defaults to end.
 */
const newThought = (state: State, { at, insertNewSubthought, insertBefore, value = '', offset, preventSetCursor }: Payload) => {

  const tutorialStep = +(getSetting(state, 'Tutorial Step') || 0)
  const tutorialStepNewThoughtCompleted =
    // new thought
    (!insertNewSubthought && (
      Math.floor(tutorialStep) === TUTORIAL_STEP_FIRSTTHOUGHT ||
      Math.floor(tutorialStep) === TUTORIAL_STEP_SECONDTHOUGHT
    )) ||
    // new thought in context
    (insertNewSubthought && Math.floor(tutorialStep) === TUTORIAL_STEP_SUBTHOUGHT) ||
    // enter after typing text
    (state.cursor && headValue(state.cursor).length > 0 &&
      (tutorialStep === TUTORIAL_STEP_SECONDTHOUGHT_ENTER ||
        tutorialStep === TUTORIAL_STEP_FIRSTTHOUGHT_ENTER))

  const path = at || state.cursor || RANKED_ROOT

  // prevent adding Subthought to readonly or unextendable Thought
  const sourcePath = insertNewSubthought ? path : contextOf(path)
  if (hasChild(state, pathToContext(sourcePath), '=readonly')) {
    return error(state, {
      value: `"${ellipsize(headValue(sourcePath))}" is read-only. No subthoughts may be added.`
    })
  }
  else if (hasChild(state, pathToContext(sourcePath), '=unextendable')) {
    return error(state, {
      value: `"${ellipsize(headValue(sourcePath))}" is unextendable. No subthoughts may be added.`
    })
  }

  const contextChain = splitChain(state, path)
  const thoughtsRanked = contextChain.length > 1
    ? lastThoughtsFromContextChain(state, contextChain)
    : path
  const showContexts = isContextViewActive(state, pathToContext(thoughtsRanked))
  const showContextsParent = isContextViewActive(state, pathToContext(contextOf(thoughtsRanked)))
  const context = pathToContext(showContextsParent && contextChain.length > 1 ? contextChain[contextChain.length - 2]
    : !showContextsParent && thoughtsRanked.length > 1 ? contextOf(thoughtsRanked) :
    RANKED_ROOT)

  // use the live-edited value
  // const thoughtsLive = showContextsParent
  //   ? contextOf(contextOf(thoughts)).concat().concat(head(thoughts))
  //   : thoughts
  // const thoughtsRankedLive = showContextsParent
  //   ? contextOf(contextOf(path).concat({ value: innerTextRef, rank })).concat(head(path))
  //   : path

  // if meta key is pressed, add a child instead of a sibling of the current thought
  // if shift key is pressed, insert the child before the current thought
  const newRank = (showContextsParent && !insertNewSubthought) || (showContexts && insertNewSubthought) ? 0 // rank does not matter here since it is autogenerated
    : (insertBefore
      ? insertNewSubthought || !path ? getPrevRank : getRankBefore
      : insertNewSubthought || !path ? getNextRank : getRankAfter
    )(state, thoughtsRanked as any)

  const reducers = [

    // newThoughtSubmit
    (state: State) => newThoughtSubmit(state, {
      context: insertNewSubthought
        ? pathToContext(thoughtsRanked)
        : context,
      // inserting a new child into a context functions the same as in the normal thought view
      addAsContext: (showContextsParent && !insertNewSubthought) || (showContexts && insertNewSubthought),
      rank: newRank,
      value
    }),

    // setCursor
    !preventSetCursor
      ? (state: State) => setCursor(state, {
        editing: true,
        // @ts-ignore
        thoughtsRanked: (insertNewSubthought ? unroot(path) : contextOf(path)).concat({ value, rank: newRank }),
        offset: offset != null ? offset : value.length,
      })
      : null,

    // tutorial step 1
    tutorialStepNewThoughtCompleted ? (state: State) => tutorialNext(state, {})
    // some hints are rolled back when a new thought is created
    : tutorialStep === TUTORIAL2_STEP_CONTEXT1_PARENT_HINT ? (state: State) =>
      tutorialStepReducer(state, { value: TUTORIAL2_STEP_CONTEXT1_PARENT })
    : tutorialStep === TUTORIAL2_STEP_CONTEXT1_HINT ? (state: State) =>
      tutorialStepReducer(state, { value: TUTORIAL2_STEP_CONTEXT1 })
    : tutorialStep === TUTORIAL2_STEP_CONTEXT2_PARENT_HINT ? (state: State) =>
      tutorialStepReducer(state, { value: TUTORIAL2_STEP_CONTEXT2_PARENT })
    : tutorialStep === TUTORIAL2_STEP_CONTEXT2_HINT ? (state: State) =>
      tutorialStepReducer(state, { value: TUTORIAL2_STEP_CONTEXT2 })
    : null,
  ]

  return reducerFlow(reducers)(state)
}

export default _.curryRight(newThought)
