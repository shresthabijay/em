import { restoreCursorBeforeSearch, search, searchContexts, setCursor } from '../action-creators'
import { clearSelection } from '../util'
import scrollCursorIntoView from '../device/scrollCursorIntoView'
import { Thunk } from '../@types'

/** Navigates home and resets the scroll position. */
const home = (): Thunk => (dispatch, getState) => {
  const state = getState()

  if (state.search != null) {
    dispatch(search({ value: null }))
    dispatch(searchContexts({ value: null }))
    dispatch(restoreCursorBeforeSearch)
  } else {
    dispatch(setCursor({ path: null, cursorHistoryClear: true }))
    clearSelection()
    scrollCursorIntoView()
  }
}

export default home
