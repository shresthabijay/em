import _ from 'lodash'
import { treeMove } from '../util/recentlyEditedTree'
import { render, updateThoughts } from '../reducers'
import { getNextRank, getThought, getAllChildren, getChildrenRanked, isPending, simplifyPath } from '../selectors'
import { State } from '../util/initialState'
import { Child, Context, Index, Lexeme, Parent, Path, Timestamp } from '../types'

// util
import {
  addContext,
  equalArrays,
  equalThoughtRanked,
  equalThoughtValue,
  hashContext,
  hashThought,
  head,
  headId,
  headRank,
  moveThought,
  normalizeThought,
  parentOf,
  pathToContext,
  reducerFlow,
  removeContext,
  removeDuplicatedContext,
  rootedParentOf,
  subsetThoughts,
  timestamp,
} from '../util'

type LexemeUpdate = {
  value: string,
  newThought: Lexeme,
  contextsNew: Context[],
  contextsOld: Context[],
}

type ChildUpdate = {
  archived?: Timestamp,
  id: string,
  pathNew: Path,
  pathOld: Path,
  pending?: boolean,
  rank: number,
  value: string,
}

type RecursiveMoveResult = {
  lexemeUpdates: Index<LexemeUpdate>,
  childUpdates: Index<ChildUpdate>,
}

/** Moves a thought from one context to another, or within the same context. */
const existingThoughtMove = (state: State, { oldPath, newPath, offset }: {
  oldPath: Path,
  newPath: Path,
  offset?: number,
}) => {
  const oldSimplePath = simplifyPath(state, oldPath)
  const newSimplePath = simplifyPath(state, newPath)
  const thoughtIndexNew = { ...state.thoughts.thoughtIndex }
  const oldThoughts = pathToContext(oldSimplePath)
  const newThoughts = pathToContext(newSimplePath)
  const value = head(oldThoughts)
  const key = hashThought(value)
  const oldRank = headRank(oldSimplePath)
  const newRank = headRank(newSimplePath)
  const oldContext = rootedParentOf(oldThoughts)
  const newContext = rootedParentOf(newThoughts)
  const sameContext = equalArrays(oldContext, newContext)
  const oldThought = getThought(state, value)

  // guard against missing lexeme (although this should never happen)
  if (!oldThought) {
    console.error('Lexeme not found', oldPath)
    return state
  }

  const isArchived = newThoughts.indexOf('=archive') !== -1
  // find exact thought from thoughtIndex
  const exactThought = oldThought.contexts.find(thought => equalArrays(thought.context, oldContext) && thought.rank === oldRank)

  // find id of head thought from exact thought if not available in oldPath
  const id = headId(oldSimplePath) || exactThought?.id

  // if move is used for archive then update the archived field to latest timestamp
  const archived = isArchived || !exactThought
    ? timestamp()
    : exactThought.archived as Timestamp

  const movedThought = moveThought(oldThought, oldContext, newContext, oldRank, newRank, id as string, archived as Timestamp)

  const newThought = removeDuplicatedContext(movedThought, newContext)
  const isPathInCursor = state.cursor && subsetThoughts(state.cursor, oldPath)

  // Uncaught TypeError: Cannot perform 'IsArray' on a proxy that has been revoked at Function.isArray (#417)
  let recentlyEdited = state.recentlyEdited // eslint-disable-line fp/no-let
  try {
    recentlyEdited = treeMove(state.recentlyEdited, oldPath, newPath)
  }
  catch (e) {
    console.error('existingThoughtMove: treeMove immer error')
    console.error(e)
  }

  // preserve contextIndex
  const contextEncodedOld = hashContext(oldContext)
  const contextEncodedNew = hashContext(newContext)

  // if the contexts have changed, remove the value from the old contextIndex and add it to the new
  const subthoughtsOld = getAllChildren(state, oldContext)
    .filter(child => !equalThoughtRanked(child, { value, rank: oldRank }))

  const duplicateSubthought = getChildrenRanked(state, newContext)
    .find(equalThoughtValue(value))

  const isDuplicateMerge = duplicateSubthought && !sameContext

  const subthoughtsNew = getAllChildren(state, newContext)
    .filter(child => child.value !== value)
    .concat({
      value,
      rank: isDuplicateMerge && duplicateSubthought ? duplicateSubthought.rank : newRank,
      id,
      lastUpdated: timestamp(),
      ...archived ? { archived } : {},
    })

  const shouldUpdateRank = isPathInCursor && isDuplicateMerge

  // if duplicate subthoughts are merged then use rank of the duplicate thought in the new path instead of the newly calculated rank
  const updatedNewPath = shouldUpdateRank && duplicateSubthought
    ? parentOf(newPath).concat(duplicateSubthought)
    : newPath

  const updatedNewSimplePath = shouldUpdateRank && duplicateSubthought
    ? parentOf(newSimplePath).concat(duplicateSubthought)
    : newSimplePath

  /** Updates descendants. */
  const recursiveUpdates = (pathOld: Path, pathNew: Path, contextRecursive: Context = []): RecursiveMoveResult => {

    const newLastRank = getNextRank(state, pathToContext(pathNew)) // get next rank in new path
    const simplePathOld = simplifyPath(state, pathOld)// simple old path
    const oldThoughts = pathToContext(simplePathOld) // old context

    return getChildrenRanked(state, oldThoughts).reduce((accum, child, i) => {

      const hashedKey = hashThought(child.value)
      // lexeme of the moved thought value
      // NOTE: thoughtIndex is updated on the fly
      // @thoughtIndex
      const thoughtAccum = getThought({ ...state, thoughts: { ...state.thoughts, thoughtIndex: thoughtIndexNew } }, child.value)

      if (!thoughtAccum) {
        console.warn(`Missing lexeme "${child.value}"`)
        console.warn('context', oldThoughts)
      }

      // old contexts in which the thoughts reside
      // @thoughtIndex
      const contextsOld = ((getThought(state, child.value) || {}).contexts || [])
        .map(thoughtContext => thoughtContext.context)

      const childContext: Context = [...oldThoughts, child.value]
      const childPathOld: Path = [...pathOld, child]

      // why use previous child that doesn't have updated rank here ?
      const childPathNew: Path = [...pathNew, child]

      // context without head. It reprents recursive context from which recursive update has started
      const contextRecursiveNew: Context = [...contextRecursive, child.value]

      // new context of this child
      const contextNew: Context = [...newThoughts, ...contextRecursive]

      // update rank of first depth of childs except when a thought has been moved within the same context
      const movedRank = !sameContext && newLastRank ? newLastRank + i : child.rank

      // if move is used for archive then update the archived field to latest timestamp
      const archived = isArchived || !exactThought
        ? timestamp()
        : exactThought.archived as Timestamp

      // lexeme with old context removed
      // thoughtAccum should always exist, but unfortunately there is a bug somewhere that causes there to be missing lexemes
      // define a new lexeme if the old lexeme is missing
      const childOldThoughtContextRemoved = thoughtAccum
        ? removeContext(thoughtAccum, oldThoughts, child.rank)
        : {
          contexts: [],
          value: child.value,
          created: timestamp(),
          lastUpdated: timestamp()
        }

      // New lexeme
      const childNewThought = removeDuplicatedContext(addContext(childOldThoughtContextRemoved, contextNew, movedRank, child.id as string, archived), contextNew)

      // New context after it has been removed
      const contextsNew = (childNewThought.contexts || []).map(contexts => contexts.context)

      // update local thoughtIndex so that we do not have to wait for firebase
      thoughtIndexNew[hashedKey] = childNewThought

      const childOldContextHash = hashContext(pathToContext(childPathOld))

      const lexemeUpdate: LexemeUpdate = {
        // merge sibling updates
        // Order matters: accum must have precendence over accumRecursive so that contextNew is correct
        // merge current thought update
        value: child.value,
        newThought: childNewThought,
        contextsOld,
        contextsNew,
      }

      const childUpdate: ChildUpdate = {
        // child.id is undefined sometimes. Unable to reproduce.
        id: child.id ?? '',
        // TODO: Confirm that find will always succeed
        rank: ((childNewThought.contexts || [])
          .find(context => equalArrays(context.context, contextNew))
            )!.rank,
        pending: isPending(state, childContext),
        archived,
        pathOld: childPathOld,
        pathNew: childPathNew,
        value: child.value,
      }

      const { lexemeUpdates: recursiveLexemeUpdates, childUpdates: recursivechildUpdates } = recursiveUpdates(childPathOld, childPathNew, contextRecursiveNew)

      return {
        lexemeUpdates: {
          ...accum.lexemeUpdates,
          [hashedKey]: lexemeUpdate,
          ...recursiveLexemeUpdates
        },
        childUpdates: {
          ...accum.childUpdates,
          [childOldContextHash]: childUpdate,
          ...recursivechildUpdates
        }
      }

    }, { lexemeUpdates: {}, childUpdates: {} } as RecursiveMoveResult)
  }

  const { lexemeUpdates, childUpdates } = recursiveUpdates(oldSimplePath, updatedNewSimplePath)

  const descendantUpdates = _.transform(lexemeUpdates, (accum, { newThought }, key: string) => {
    accum[key] = newThought
  }, {} as Index<Lexeme>)

  const contextIndexDescendantUpdates = sameContext
    ? {} as {
      contextIndex: Index<Parent | null>,
      pendingMoves: { pathOld: Path, pathNew: Path }[],
    }
    : Object.values(lexemeUpdates).reduce((accum, result) =>
      result.contextsOld.reduce((accumInner, contextOld, i) => {
        const contextNew = result.contextsNew[i]
        const contextEncodedOld = hashContext(contextOld)
        const contextEncodedNew = hashContext(contextNew)

        const childUpdate = childUpdates[hashContext(contextOld.concat(result.value))]

        const accumInnerChildrenOld = accumInner.contextIndex[contextEncodedOld]?.children
        const accumInnerChildrenNew = accumInner.contextIndex[contextEncodedNew]?.children
        const childrenOld = (accumInnerChildrenOld || getAllChildren(state, contextOld))
          .filter((child: Child) => normalizeThought(child.value) !== normalizeThought(result.value))
        const childrenNew = (accumInnerChildrenNew || getAllChildren(state, contextNew))
          .filter((child: Child) => normalizeThought(child.value) !== normalizeThought(result.value))
          .concat({
            value: childUpdate.value,
            rank: childUpdate.rank,
            lastUpdated: timestamp(),
            // result.id is undefined sometimes. Unable to reproduce.
            id: childUpdate.id ?? '',
            ...childUpdate.archived ? { archived: childUpdate.archived } : null
          })

        // if (result.pending) {
        //   return {
        //     contextIndex: {},
        //     pendingMoves: [...accum.pendingMoves, ...result.pending ? [{
        //       pathOld: result.pathOld,
        //       pathNew: result.pathNew,
        //     }] : []]
        //   }
        // }

        const accumNew = {
          contextIndex: {
            ...accumInner.contextIndex,
            [contextEncodedOld]: childrenOld.length > 0 ? {
              context: contextOld,
              children: childrenOld,
              lastUpdated: timestamp(),
              ...childUpdate.pending ? { pending: true } : null,
            } : null,
            [contextEncodedNew]: {
              context: contextNew,
              children: childrenNew,
              lastUpdated: timestamp(),
              ...childUpdate.pending ? { pending: true } : null,
            },
          },
          pendingMoves: [...accum.pendingMoves, ...childUpdate.pending ? [{
            pathOld: childUpdate.pathOld,
            pathNew: childUpdate.pathNew,
          }] : []]
        }

        return accumNew
      }, accum)
    , {
      contextIndex: {},
      pendingMoves: [] as { pathOld: Path, pathNew: Path }[]
    } as {
      contextIndex: Index<Parent | null>,
      pendingMoves: { pathOld: Path, pathNew: Path }[],
    })

  const contextIndexUpdates: Index<Parent | null> = {
    [contextEncodedOld]: subthoughtsOld.length > 0 ? {
      context: oldContext,
      children: subthoughtsOld,
      lastUpdated: timestamp(),
    } : null,
    [contextEncodedNew]: {
      context: newContext,
      children: subthoughtsNew,
      lastUpdated: timestamp(),
    },
    ...contextIndexDescendantUpdates.contextIndex,
  }

  const thoughtIndexUpdates = {
    [key]: newThought,
    ...descendantUpdates
  }

  thoughtIndexNew[key] = newThought

  // preserve contextViews
  const contextViewsNew = { ...state.contextViews }
  if (state.contextViews[contextEncodedNew] !== state.contextViews[contextEncodedOld]) {
    contextViewsNew[contextEncodedNew] = state.contextViews[contextEncodedOld]
    delete contextViewsNew[contextEncodedOld] // eslint-disable-line fp/no-delete
  }

  /** Returns new path for the given old context.
   * Note: This uses childUpdates so it works only for updated descendants. For main ancestor oldPath that has been moved (ancestor) use updatedNewPath instead.
   */
  const getNewPathFromOldContext = (path: Path) => childUpdates[hashContext(pathToContext(path))].pathNew

  // if cursor is at old path then we don't need to find getNewPathfromContext as we already have updatedNewPath
  // Example: [a.b] (oldPath) and [a.b] (cursor) are subsets of each other
  const isCursorAtOldPath = isPathInCursor && state.cursor?.length === oldPath.length

  const newCursorPath = isPathInCursor ?
    isCursorAtOldPath ?
      updatedNewPath : getNewPathFromOldContext(state.cursor || [])
    : state.cursor

  return reducerFlow([

    state => ({
      ...state,
      contextViews: contextViewsNew,
      cursor: newCursorPath,
      ...offset != null ? { cursorOffset: offset } : null,
    }),

    // update thoughts
    updateThoughts({
      contextIndexUpdates,
      thoughtIndexUpdates,
      recentlyEdited,
      pendingMoves: contextIndexDescendantUpdates.pendingMoves,
    }),

    // render
    render,

  ])(state)
}

export default _.curryRight(existingThoughtMove, 2)
