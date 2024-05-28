import { GraphQLClient, gql } from "graphql-request";
import ShopifyToken from "shopify-token";

// Function to search products
export async function searchProducts({ domain, accessToken, searchEntry }) {
  const shopifyClient = new GraphQLClient(
    `https://${domain}/admin/api/graphql.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    }
  );

  const gqlQuery = gql`
    query SearchProducts($query: String) {
      productVariants(first: 15, query: $query) {
        edges {
          node {
            id
            availableForSale
            image {
              originalSrc
            }
            price
            title
            product {
              id
              handle
              title
              images(first: 1) {
                edges {
                  node {
                    originalSrc
                  }
                }
              }
            }
            inventoryQuantity
            inventoryPolicy
          }
        }
      }
    }
  `;

  const { productVariants } = await shopifyClient.request(gqlQuery, {
    query: searchEntry,
  });

  if (productVariants.edges.length < 1) {
    throw new Error("No products found from Shopify");
  }

  console.log({ productVariants });

  const products = productVariants.edges.map(({ node }) => ({
    image:
      node.image?.originalSrc || node.product.images.edges[0]?.node.originalSrc,
    title: `${node.product.title} - ${node.title}`,
    productId: node.product.id.split("/").pop(),
    variantId: node.id.split("/").pop(),
    price: node.price,
    availableForSale: node.availableForSale,
    inventory: node.inventoryQuantity,
    inventoryTracked: node.inventoryPolicy !== "deny",
    productLink: `https://${domain}/products/${node.product.handle}`,
  }));

  return { products };
}

// Function to get a specific product by variantId and productId
export async function getProduct({
  domain,
  accessToken,
  variantId,
  productId,
}) {
  const shopifyClient = new GraphQLClient(
    `https://${domain}/admin/api/graphql.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    }
  );

  const gqlQuery = gql`
    query GetProduct($variantId: ID!, $productId: ID!) {
      productVariant(id: $variantId) {
        id
        availableForSale
        image {
          originalSrc
        }
        price
        title
        product {
          id
          handle
          title
          images(first: 1) {
            edges {
              node {
                originalSrc
              }
            }
          }
        }
        inventoryQuantity
        inventoryPolicy
      }
    }
  `;

  const { productVariant } = await shopifyClient.request(gqlQuery, {
    variantId: `gid://shopify/ProductVariant/${variantId}`,
    productId: `gid://shopify/Product/${productId}`,
  });

  if (!productVariant) {
    throw new Error("Product not found from Shopify");
  }

  console.log({ productVariant });

  const product = {
    image:
      productVariant.image?.originalSrc ||
      productVariant.product.images.edges[0]?.node.originalSrc,
    title: `${productVariant.product.title} - ${productVariant.title}`,
    productId: productVariant.product.id.split("/").pop(),
    variantId: productVariant.id.split("/").pop(),
    price: productVariant.price,
    availableForSale: productVariant.availableForSale,
    inventory: productVariant.inventoryQuantity,
    inventoryTracked: productVariant.inventoryPolicy !== "deny",
    productLink: `https://${domain}/products/${productVariant.product.handle}`,
  };

  return { product };
}
// Get Orders
export async function searchOrders({
  domain,
  accessToken,
  query,
  first = 10,
  after = null,
}) {
  const shopifyClient = new GraphQLClient(
    `https://${domain}/admin/api/graphql.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    }
  );

  const { orders } = await shopifyClient.request(
    gql`
      query (
        $first: Int
        $after: String
        $before: String
        $last: Int
        $query: String
      ) {
        orders(
          first: $first
          after: $after
          before: $before
          last: $last
          reverse: true
          query: $query
        ) {
          pageInfo {
            hasNextPage
            hasPreviousPage
          }
          edges {
            node {
              id
              email
              name
              processedAt
              metafield(namespace: "oscart", key: "oscart") {
                value
              }
              lineItems(first: 10) {
                edges {
                  node {
                    quantity
                    variantTitle
                    variant {
                      id
                    }
                    product {
                      id
                    }
                    discountedUnitPriceSet {
                      shopMoney {
                        amount
                      }
                    }
                    id
                    name
                    image {
                      originalSrc
                    }
                    discountedTotal
                  }
                }
              }
              fulfillments(first: 25) {
                trackingInfo {
                  company
                  number
                  url
                }
              }
              note
              shippingAddress {
                address1
                address2
                city
                name
                provinceCode
                zip
                country
              }
              totalReceivedSet {
                shopMoney {
                  amount
                }
              }
            }
            cursor
          }
        }
      }
    `,
    { query, first, after }
  );

  const formattedOrders = orders.edges.map(
    ({
      cursor,
      node: {
        id,
        name,
        email,
        processedAt,
        lineItems,
        metafield,
        fulfillments,
        note,
        shippingAddress: {
          address1,
          address2,
          city,
          provinceCode,
          zip,
          country,
          name: shipName,
        },
        totalReceivedSet: {
          shopMoney: { amount: totalPrice },
        },
      },
    }) => ({
      orderId: id,
      orderName: name,
      link: `https://${domain}/admin/orders/${id.split("/").pop()}`,
      date: Intl.DateTimeFormat("en-US").format(Date.parse(processedAt)),
      first_name: shipName.split(" ")[0],
      last_name: shipName.split(" ")[1] || shipName.split(" ")[0],
      streetAddress1: address1,
      streetAddress2: address2,
      city,
      state: provinceCode,
      zip,
      country,
      email,
      cartItems: metafield && JSON.parse(metafield.value),
      cursor,
      lineItems: lineItems.edges.map(
        ({
          node: {
            id,
            name,
            quantity,
            product,
            variant,
            image: { originalSrc },
            discountedUnitPriceSet: {
              shopMoney: { amount },
            },
          },
        }) => ({
          name,
          quantity,
          price: amount,
          image: originalSrc,
          productId: product.id.split("/").pop(),
          variantId: variant.id.split("/").pop(),
          lineItemId: id.split("/").pop(),
        })
      ),
      fulfillments: fulfillments.map(({ trackingInfo }) => ({
        company: trackingInfo?.company,
        number: trackingInfo?.number,
        url: trackingInfo?.url,
      })),
      note,
      totalPrice,
    })
  );

  return { orders: formattedOrders, pageInfo: orders.pageInfo };
}

// Create Webhook
export async function createWebhook({ domain, accessToken, topic, endpoint }) {
  const mapTopic = {
    ORDER_CREATED: "ORDERS_CREATE",
    ORDER_CANCELLED: "ORDERS_CANCELLED",
    ORDER_CHARGEBACKED: "DISPUTES_CREATE",
    TRACKING_CREATED: "FULFILLMENTS_CREATE",
  };

  if (!mapTopic[topic]) {
    throw new Error("Topic not mapped yet");
  }

  const shopifyClient = new GraphQLClient(
    `https://${domain}/admin/api/graphql.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    }
  );

  const {
    webhookSubscriptionCreate: { userErrors, webhookSubscription },
  } = await shopifyClient.request(
    gql`
      mutation (
        $topic: WebhookSubscriptionTopic!
        $webhookSubscription: WebhookSubscriptionInput!
      ) {
        webhookSubscriptionCreate(
          topic: $topic
          webhookSubscription: $webhookSubscription
        ) {
          userErrors {
            field
            message
          }
          webhookSubscription {
            id
          }
        }
      }
    `,
    {
      topic: mapTopic[topic],
      webhookSubscription: {
        callbackUrl: `${process.env.FRONTEND_URL}${endpoint}`,
        format: "JSON",
      },
    }
  );

  if (userErrors.length > 0) {
    throw new Error(`Error creating webhook: ${userErrors[0].message}`);
  }

  return { success: "Webhook created", webhookId: webhookSubscription.id };
}

// Delete Webhook
export async function deleteWebhook({ domain, accessToken, webhookId }) {
  const shopifyClient = new GraphQLClient(
    `https://${domain}/admin/api/graphql.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    }
  );

  const {
    webhookSubscriptionDelete: { userErrors, deletedWebhookSubscriptionId },
  } = await shopifyClient.request(
    gql`
      mutation webhookSubscriptionDelete($id: ID!) {
        webhookSubscriptionDelete(id: $id) {
          deletedWebhookSubscriptionId
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      id: webhookId,
    }
  );

  if (userErrors.length > 0) {
    throw new Error(`Error deleting webhook: ${userErrors[0].message}`);
  }

  return { success: "Webhook deleted" };
}

// Get Webhooks
export async function getWebhooks({ domain, accessToken }) {
  const mapTopic = {
    ORDERS_CREATE: "ORDER_CREATED",
    ORDERS_CANCELLED: "ORDER_CANCELLED",
    DISPUTES_CREATE: "ORDER_CHARGEBACKED",
    FULFILLMENTS_CREATE: "TRACKING_CREATED",
  };

  const shopifyClient = new GraphQLClient(
    `https://${domain}/admin/api/graphql.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    }
  );

  const data = await shopifyClient.request(
    gql`
      query {
        webhookSubscriptions(first: 10) {
          edges {
            node {
              id
              callbackUrl
              createdAt
              topic
              includeFields
            }
          }
        }
      }
    `
  );

  return {
    webhooks: data?.webhookSubscriptions.edges.map(({ node }) => ({
      ...node,
      callbackUrl: node.callbackUrl.replace(process.env.FRONTEND_URL, ""),
      topic: mapTopic[node.topic],
    })),
  };
}

export async function updateProduct({
  domain,
  accessToken,
  variantId,
  price,
  inventoryDelta,
}) {
  const shopifyClient = new GraphQLClient(
    `https://${domain}/admin/api/2024-04/graphql.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    }
  );

  // Fetch all locations
  const fetchLocationsQuery = gql`
    query {
      locations(first: 10) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;

  const { locations } = await shopifyClient.request(fetchLocationsQuery);

  if (!locations.edges.length) {
    throw new Error("No locations found for inventory adjustments.");
  }

  const locationId = locations.edges[0].node.id; // Assuming the first location

  // Fetch the product variant to get inventory details
  const fetchProductVariantQuery = gql`
    query ($id: ID!) {
      productVariant(id: $id) {
        id
        inventoryItem {
          id
        }
        inventoryQuantity
        product {
          id
          handle
        }
      }
    }
  `;

  const { productVariant } = await shopifyClient.request(
    fetchProductVariantQuery,
    {
      id: `gid://shopify/ProductVariant/${variantId}`,
    }
  );

  const inventoryItemId = productVariant.inventoryItem.id;

  // Adjust inventory quantity using inventoryAdjustQuantities mutation
  const adjustInventoryQuantityMutation = gql`
    mutation ($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) {
        inventoryAdjustmentGroup {
          createdAt
          reason
          referenceDocumentUri
          changes {
            name
            delta
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const inventoryAdjustResponse = await shopifyClient.request(
    adjustInventoryQuantityMutation,
    {
      input: {
        reason: "correction", // Adjust as needed
        name: "available",
        referenceDocumentUri: "logistics://some.warehouse/take/2023-01/13", // Adjust URI as needed
        changes: [
          {
            delta: inventoryDelta,
            inventoryItemId: inventoryItemId,
            locationId: locationId,
          },
        ],
      },
    }
  );

  const { inventoryAdjustQuantities } = inventoryAdjustResponse;

  if (inventoryAdjustQuantities.userErrors.length) {
    console.error(
      "Error adjusting inventory:",
      inventoryAdjustQuantities.userErrors
    );
    throw new Error("Error adjusting inventory.");
  }

  // Update product variant price if provided
  if (price !== undefined) {
    const updatePriceMutation = gql`
      mutation ($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
            id
            price
            compareAtPrice
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const productVariantUpdateResponse = await shopifyClient.request(
      updatePriceMutation,
      {
        input: {
          id: `gid://shopify/ProductVariant/${variantId}`,
          price: price,
          compareAtPrice: Math.ceil(Number(price) * 1.7) - 0.01,
        },
      }
    );

    const { productVariantUpdate } = productVariantUpdateResponse;

    if (productVariantUpdate.userErrors.length) {
      console.error(
        "Error updating product variant price:",
        productVariantUpdate.userErrors
      );
      throw new Error("Error updating product variant price.");
    }

    return {
      updatedVariant: productVariantUpdate.productVariant,
      inventoryAdjustmentGroup:
        inventoryAdjustQuantities.inventoryAdjustmentGroup,
    };
  } else {
    return {
      updatedVariant: {
        id: productVariant.id,
        price: productVariant.price,
      },
      inventoryAdjustmentGroup:
        inventoryAdjustQuantities.inventoryAdjustmentGroup,
    };
  }
}

// Add this function to the existing file
export async function addCartToPlatformOrder({
  cart,
  orderId,
  domain,
  accessToken,
}) {
  const shopifyClient = new GraphQLClient(
    `https://${domain}/admin/api/graphql.json`,
    {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    }
  );

  const { orderUpdate } = await shopifyClient.request(
    gql`
      mutation ($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            metafields(first: 100) {
              edges {
                node {
                  id
                  namespace
                  key
                  value
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      input: {
        id: `gid://shopify/Order/${orderId}`,
        metafields: [
          {
            namespace: "oscart",
            key: "oscart",
            value: JSON.stringify(cart),
            type: "json_string",
          },
        ],
      },
    }
  );

  if (orderUpdate.userErrors.length > 0) {
    throw new Error(
      `Error updating order: ${orderUpdate.userErrors[0].message}`
    );
  }

  return { order: orderUpdate?.order };
}

export async function addTracking({
  order,
  trackingCompany,
  trackingNumber,
}) {
  const FETCH_FULFILLMENT_ORDER = gql`
    query ($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 1) {
          edges {
            node {
              id
              status
              fulfillments(first: 1) {
                edges {
                  node {
                    id
                    trackingInfo {
                      number
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const UPDATE_FULFILLMENT_TRACKING_INFO = gql`
    mutation fulfillmentTrackingInfoUpdateV2(
      $fulfillmentId: ID!
      $trackingInfoInput: FulfillmentTrackingInput!
    ) {
      fulfillmentTrackingInfoUpdateV2(
        fulfillmentId: $fulfillmentId
        trackingInfoInput: $trackingInfoInput
      ) {
        fulfillment {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const CREATE_FULFILLMENT = gql`
    mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
      fulfillmentCreateV2(fulfillment: $fulfillment) {
        fulfillment {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const client = new GraphQLClient(
    `https://${order.shop.domain}/admin/api/graphql.json`,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": order.shop.accessToken,
      },
    }
  );

  const data = await client.request(FETCH_FULFILLMENT_ORDER, {
    id: `gid://shopify/Order/${order.orderId}`,
  });

  const fulfillmentOrder = data.order.fulfillmentOrders.edges[0].node;

  if (fulfillmentOrder.status === "CLOSED") {
    const fulfillment = fulfillmentOrder.fulfillments.edges[0].node;
    const updateResponseBody = await client.request(
      UPDATE_FULFILLMENT_TRACKING_INFO,
      {
        fulfillmentId: fulfillment.id,
        trackingInfoInput: {
          numbers: [
            trackingNumber,
            ...fulfillment.trackingInfo.map(({ number }) => number),
          ],
        },
      }
    );
    return updateResponseBody;
  }

  const createResponseBody = await client.request(CREATE_FULFILLMENT, {
    fulfillment: {
      lineItemsByFulfillmentOrder: [
        {
          fulfillmentOrderId: fulfillmentOrder.id,
        },
      ],
      trackingInfo: {
        company: trackingCompany,
        numbers: trackingNumber,
      },
    },
  });

  return createResponseBody;
}

// Function to get config for Shopify
export function getConfig() {
  return {
    apiKey: process.env.SHOP_SHOPIFY_API_KEY,
    apiSecret: process.env.SHOP_SHOPIFY_SECRET,
    redirectUri: `${process.env.FRONTEND_URL}/api/o-auth/shop/callback/shopify`,
    scopes: [
      "write_orders",
      "write_products",
      "read_orders",
      "read_products",
      "read_fulfillments",
      "write_fulfillments",
      "write_draft_orders",
      "read_assigned_fulfillment_orders",
      "write_assigned_fulfillment_orders",
      "read_merchant_managed_fulfillment_orders",
      "write_merchant_managed_fulfillment_orders",
    ],
  };
}

// Shopify OAuth function
export async function oauth(req, res, config) {
  const shop = req.query.shop;
  const state = req.query.state;
  const redirectUri = config.redirectUri;
  const scopes = config.scopes;

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${
    config.apiKey
  }&scope=${scopes.join(",")}&state=${state}&redirect_uri=${redirectUri}`;
  res.redirect(authUrl);
}

// Shopify callback function
export async function callback(query, config) {
  const { shop, hmac, code, timestamp } = query;

  async function getToken() {
    if (!code) {
      return {
        status: 422,
        redirect: `${process.env.FRONTEND_URL}/api/o-auth/shop/shopify?shop=${shop}`,
      };
    }

    if (!hmac || !timestamp) {
      return { status: 422, error: "Unprocessable Entity" };
    }

    const shopifyToken = new ShopifyToken({
      redirectUri: `${config.redirectUri}/callback`,
      sharedSecret: config.apiSecret,
      apiKey: config.apiKey,
      scopes: config.scopes,
      accessMode: "offline",
      timeout: 10000,
    });

    if (!shopifyToken.verifyHmac(query)) {
      console.error("Error validating hmac");
      throw new Error("Error validating hmac");
    }

    const data = await shopifyToken.getAccessToken(shop, code);
    return data.access_token;
  }

  const accessToken = await getToken();
  return accessToken;
}

export async function cancelOrderWebhookHandler(req, res) {
  if (!req.body.id) {
    return res.status(400).json({ error: "Missing fields needed to cancel order" });
  }
  return req.body.id.toString();
}

export async function createOrderWebhookHandler(req, res) {
  if (req.body) {
    const existingShop = await keystoneContext.sudo().query.Shop.findOne({
      where: {
        domain: req.headers["x-shopify-shop-domain"],
      },
      query: `
        id
        domain
        accessToken
        user {
          id
          email
        }
        links {
          channel {
            id
            name
          }
        }
      `,
    });

    const lineItemsOutput = await Promise.all(
      req.body.line_items.map(async ({ id, name, price, quantity, variant_id, product_id, sku }) => {
        const pvRes = await fetch(
          `https://${existingShop.domain}/admin/api/graphql.json`,
          {
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": existingShop.accessToken,
            },
            method: "POST",
            body: JSON.stringify({
              query: `
                query productVariant($id: ID!) {
                  productVariant(id: $id) {
                    image {
                      originalSrc
                    }
                    product {
                      id
                      images(first : 1) {
                        edges {
                          node {
                            originalSrc
                          }
                        }
                      }
                    }
                  }
                }
              `,
              variables: { id: `gid://shopify/ProductVariant/${variant_id}` },
            }),
          }
        );

        const { data: pvData } = await pvRes.json();
        if (pvData?.productVariant) {
          return {
            name,
            price,
            lineItemId: id.toString(),
            quantity,
            image:
              (pvData.productVariant.image && pvData.productVariant.image.originalSrc) ||
              pvData.productVariant.product.images.edges[0]?.node.originalSrc,
            productId: product_id.toString(),
            variantId: variant_id.toString(),
            sku: sku.toString(),
            user: { connect: { id: existingShop.user.id } },
          };
        }
        return null;
      })
    );

    return {
      orderId: req.body.id,
      orderName: req.body.name,
      email: req.body.email,
      first_name: req.body.shipping_address.first_name,
      last_name: req.body.shipping_address.last_name,
      streetAddress1: req.body.shipping_address.address1,
      streetAddress2: req.body.shipping_address.address2,
      city: req.body.shipping_address.city,
      state: req.body.shipping_address.province_code,
      zip: req.body.shipping_address.zip,
      country: req.body.shipping_address.country_code,
      shippingMethod: req.body.shipping_lines,
      currency: req.body.currency,
      phoneNumber: req.body.shipping_address.phone,
      note: req.body.note,
      lineItems: { create: lineItemsOutput },
      user: { connect: { id: existingShop.user.id } },
      shop: { connect: { id: existingShop.id } },
      status: "INPROCESS",
      linkOrder: true,
      matchOrder: true,
      processOrder: true,
    };
  }
}

