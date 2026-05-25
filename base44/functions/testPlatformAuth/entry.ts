import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

/**
 * Platform role helpers (inline for backend functions - no local imports)
 */
function isBase44SuperAdmin(user) {
  return user?.role === 'admin';
}

function isPlatformOwner(user) {
  return user?.role === 'platform_owner' || user?.role === 'admin';
}

function isPlatformAdmin(user) {
  return ['admin', 'platform_owner', 'platform_admin'].includes(user?.role);
}

function isSupportAgent(user) {
  return ['admin', 'platform_owner', 'platform_admin', 'support_agent'].includes(user?.role);
}

function isReadOnlySupport(user) {
  return ['admin', 'platform_owner', 'platform_admin', 'support_agent', 'readonly_support'].includes(user?.role);
}

/**
 * Test function to verify platform auth roles are working correctly
 * Call with: base44.functions.invoke('testPlatformAuth', {})
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({
        status: 'error',
        message: 'User not authenticated',
      });
    }

    // Test A: backend@slidebnb.de should be admin
    const testA = {
      name: 'Test A: backend@slidebnb.de admin role',
      userEmail: user.email,
      role: user.role,
      isBase44SuperAdmin: isBase44SuperAdmin(user),
      isPlatformOwner: isPlatformOwner(user),
      isPlatformAdmin: isPlatformAdmin(user),
      expectedForAdmin: {
        role: 'admin',
        isBase44SuperAdmin: true,
        isPlatformOwner: true,
        isPlatformAdmin: true,
      },
    };

    // Test B: Check organization membership if any
    let testB = { name: 'Test B: Organization check', message: 'Skipped - no org check needed for platform roles' };
    if (user.email && !user.email.includes('backend@slidebnb.de')) {
      const orgs = await base44.asServiceRole.entities.Organization.filter({ owner_email: user.email });
      const members = await base44.asServiceRole.entities.OrganizationMember.filter({ user_email: user.email });

      testB = {
        name: 'Test B: Organization membership',
        userEmail: user.email,
        isOwner: orgs.length > 0,
        isMember: members.length > 0,
        organizationRoles: members.map(m => m.role),
        expectedCheck: 'organization_admin should not have platform admin access',
      };
    }

    // Test C: Support agent access check
    const testC = {
      name: 'Test C: Support agent role check',
      isSupportAgent: isSupportAgent(user),
      isReadOnlySupport: isReadOnlySupport(user),
      expectedForSupportAgent: {
        isSupportAgent: user.role === 'support_agent' || isPlatformAdmin(user),
        isReadOnlySupport: ['support_agent', 'readonly_support', 'platform_owner', 'platform_admin', 'admin'].includes(user.role),
      },
    };

    // Test D: Role hierarchy check
    const testD = {
      name: 'Test D: Role hierarchy verification',
      currentRole: user.role,
      roleHierarchy: {
        admin: { owns: ['platform_owner', 'platform_admin', 'support_agent', 'readonly_support', 'user'] },
        platform_owner: { owns: ['platform_admin', 'support_agent', 'readonly_support', 'user'] },
        platform_admin: { owns: ['support_agent', 'readonly_support', 'user'] },
        support_agent: { owns: ['readonly_support', 'user'] },
        readonly_support: { owns: ['user'] },
        user: { owns: [] },
      },
    };

    return Response.json({
      status: 'ok',
      currentUser: {
        email: user.email,
        role: user.role,
      },
      tests: [testA, testB, testC, testD],
      summary: {
        authenticatedAsAdmin: user.role === 'admin',
        canAccessPlatformFeatures: isPlatformAdmin(user),
        canAccessSupportDashboard: isSupportAgent(user),
        isRestrictedToReadOnly: user.role === 'readonly_support',
      },
    });
  } catch (error) {
    console.error('[testPlatformAuth] Error:', error.message);
    return Response.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
});