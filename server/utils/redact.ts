/** The URL without its password, for logs. */
export const redactUrl = (url: string) => url.replace(/\/\/([^:@/]+):[^@]*@/, '//$1:***@')
