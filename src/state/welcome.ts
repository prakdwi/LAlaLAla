/** First-run flag: the starter picker and coach show once per browser. */
export const WELCOME_KEY = 'lalala-welcome'

export const welcomeSeen = () => {
  try {
    return localStorage.getItem(WELCOME_KEY) === 'done'
  } catch {
    return true
  }
}
export const markWelcome = () => {
  try {
    localStorage.setItem(WELCOME_KEY, 'done')
  } catch {
    /* storage unavailable: the welcome shows again next time */
  }
}
