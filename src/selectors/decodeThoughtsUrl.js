import {
  ROOT_TOKEN,
} from '../constants'
import { store } from '../store'

// util
import { componentToThought, hashContext } from '../util'

// selectors
import { rankThoughtsFirstMatch } from '../selectors'

/**
 * parses the thoughts from the url
 * @return { thoughts, contextViews }
 */
// declare using traditional function syntax so it is hoisted
export default ({ thoughtIndex, contextIndex }, pathname) => {
  const state = store.getState()
  const urlPath = pathname.slice(1)
  const urlComponents = urlPath ? urlPath.split('/') : [ROOT_TOKEN]
  const pathUnranked = urlComponents.map(componentToThought)
  const contextViews = urlComponents.reduce((accum, cur, i) =>
    /~$/.test(cur) ? Object.assign({}, accum, {
      [hashContext(pathUnranked.slice(0, i + 1))]: true
    }) : accum,
  {})
  const thoughtsRanked = rankThoughtsFirstMatch(state, pathUnranked, { state: { thoughtIndex, contextIndex, contextViews } })
  return {
    // infer ranks of url path so that url can be /A/a1 instead of /A_0/a1_0 etc
    thoughtsRanked, // : rankThoughtsFirstMatch(pathUnranked, thoughtIndex, contextViews),
    contextViews
  }
}
