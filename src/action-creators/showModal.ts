import { Thunk } from '../types'

/** Display a given modal dialog box and scroll to the top. */
const showModal = (payload: { id: string }): Thunk => (dispatch, getState) => {
  dispatch({ type: 'showModal', ...payload })
  window.scrollTo(0, 0)
}

export default showModal
