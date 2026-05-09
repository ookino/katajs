import { defineModule } from '@katajs/core';
import { makeUserRepository, type UserRepository } from './users.repository';
import { makeUserService, type UserService } from './users.service';
// katajs:module-service-imports
import { usersRoutes } from './users.routes';

export const usersModule = defineModule({
  name: 'users',
  provides: {
    userRepository: (c): UserRepository => makeUserRepository(c.db),
    userService: (c): UserService => makeUserService(c),
    // katajs:module-provides
  },
  // Independent module — no cross-module deps.
  requires: [] as const,
  routes: usersRoutes,
  prefix: '/users',
});

/** Services this module contributes to the container's `Registry`. */
export type UsersRegistry = {
  userRepository: UserRepository;
  userService: UserService;
  // katajs:module-registry
};

export type { UserRepository, UserService };
export { UserNotFoundError, EmailTakenError } from './users.errors';
