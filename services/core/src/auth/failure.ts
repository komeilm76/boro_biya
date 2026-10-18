export class AuthFailure extends Error {
  constructor(
    readonly statusCode: number = 401,
    readonly retryAfterSeconds?: number,
  ) {
    super('The request could not be accepted.');
  }
}
