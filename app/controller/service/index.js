const fs = require('fs');

const maps = {
  contract: '合同',
  review: '审核',
  draft: '起草',
  communication: '咨询',
  submitted: '已提交',
  wait_quote: '待报价',
  wait_assign: '待分配',
  wait_pay: '待支付',
  processing: '服务中',
  end: '已完结'
};
module.exports = app => {
  class Controller extends app.Controller {
    async index() {
      const {
        app: {
          methods: { objectIdEqual: oIdEqual }
        },
        ctx,
        ctx: {
          session: { entity },
          model: { Service, Order, Servicer }
        }
      } = this;

      const body = {};
      const service = await Service.findById(ctx.params.id).exec();
      console.log(service);
      // get description
      body.description = service.description;
      // processor view
      if (service.processorId) {
        // customer view
        if (!entity.privilege) {
          body.processor = await Servicer.findById(service.processorId, {
            name: 1,
            avatar: 1,
            serviceTotal: 1,
            grade: 1,
            expert: 1,
            _id: 0
          }).lean();
          if (service.status === 'end') {
            console.log(entity);
            entity.noViewedEnd = entity.noViewedEnd.filter(item => !oIdEqual(item, service._id));
            ctx
              .getLogger('indexPageHintChangeLogger')
              .info(
                `noViewedEnd————${service.customerId.toString()}————subtract`,
                service.toJSON()
              );
            entity.markModified('noViewedEnd');
            await entity.save();
          }
        }
        // manager view
        else if (!oIdEqual(entity._id, service.processorId)) {
          const temp = await Servicer.findById(service.processorId, {
            name: 1
          }).lean();
          body.processor = [temp.name, temp._id];
        }
      }
      // contact view
      body.contact = service.contact;
      // status view
      body.status = maps[service.status];
      // name view
      let name = '';
      service.name.forEach(item => (name += `-${maps[item] || item}`));
      body.name = name.slice(1);
      // can input duration
      if (
        service.status === 'end' &&
        !service.duration &&
        oIdEqual(entity._id, service.processorId)
      ) {
        body.canInputDuration = true;
      }
      // can view duration
      if (!oIdEqual(service.customerId, entity._id)) body.duration = service.duration;
      // payment view
      if (!oIdEqual(entity._id, service.processorId)) {
        body.payment = await Order.findById(service.orderId, {
          totalFee: 1,
          hasPaid: 1,
          _id: 0
        }).lean();
      }
      // can send quote
      if (['wait_quote', 'wait_pay'].includes(service.status) && entity.privilege)
        body.canSendQuote = true;

      // conclusion view
      // if (entity.privilege && service.conclusion)
      if (service.conclusion) body.conclusion = service.conclusion;
      // can endService
      if (oIdEqual(entity._id, service.processorId) && service.status === 'processing')
        body.canEndService = true;
      // can make conclusion
      if (
        service.status === 'end' &&
        oIdEqual(entity._id, service.processorId) &&
        !service.conclusion
      )
        body.canMakeConclusion = true;
      // can assign service
      if (entity.privilege && service.status === 'wait_assign') {
        body.processors = (await Servicer.find(
          { 'privilege.canProcessingService': true },
          { name: 1 }
        ).lean()).map(item => [item.name, item._id]);
        // const processors = [];
        // servicers.forEach(item => {
        // if (item.privilege.canProcessingService) processors.push([item.name, item._id]);
        // });
      }
      // comment view
      if (!oIdEqual(entity._id, service.processorId)) body.comment = service.comment;
      // can make comment
      // console.log(service);
      if (
        service.status === 'end' &&
        oIdEqual(entity._id, service.customerId) &&
        !service.comment.length
      )
        body.canMakeComment = true;

      ctx.body = body;
    }

    async update() {
      const {
        ctx,
        app: {
          methods: { objectIdEqual: oIdEqual }
        },
        ctx: {
          session: { entity },
          service: { pay },
          model: { Service, Servicer, Customer },
          request: { body }
        }
      } = this;
      const service = await Service.findById(ctx.params.id).exec();
      console.log(service);
      const customer = await Customer.findById(service.customerId).exec();
      switch (ctx.params.target) {
        case 'status': {
          service.status = 'end';
          customer.noViewedEnd.push(service._id);
          ctx
            .getLogger('indexPageHintChangeLogger')
            .info(`noViewedEnd————${customer._id.toString()}————add`, service.toJSON());
          customer.markModified('noViewedEnd');
          await customer.save();
          break;
        }
        case 'comment':
          service.comment = body;
          break;
        case 'duration':
          service.duration = body.duration;
          break;
        case 'payment': {
          if (service.status !== 'processing') {
            if (service.status === 'wait_quote') {
              console.log(11);
              service.status = 'wait_pay';
              customer.waitPayTotal += 1;
              ctx
                .getLogger('indexPageHintChangeLogger')
                .info(`waitPayTotal————${customer._id.toString()}————add`, service.toJSON(), body);
              customer.markModified('waitPayTotal');
              await customer.save();
            }
            let name = '';
            service.name.forEach(item => (name += `-${maps[item] || item}`));
            const orderId = await pay.new(body.fee, service.customerId, name.slice(1), {
              serviceId: service._id
            });
            // console.log(orderId);
            service.orderId = orderId;
          }
          break;
        }
        case 'conclusion': {
          if (body.conclusion[1].length)
            body.conclusion[1].forEach(item => {
              const uniqueId = this.app.methods.getUniqueId();
              fs.copyFileSync(item[2], `/resource/conclusion/${uniqueId}`);
              item[2] = uniqueId;
            });
          service.conclusion = body.conclusion;
          break;
        }

        case 'processor': {
          if (service.processorId) {
            const servicer = await Servicer.findById(service.processorId).exec();
            servicer.services = servicer.services.filter(item => !oIdEqual(item, service._id));
            await servicer.save();
          }
          const _body = this.ctx.request.body;
          service.processorId = _body.processorId;
          service.status = 'processing';
          const servicer = await Servicer.findById(service.processorId).exec();
          servicer.services.push(service);
          await servicer.save();
          await service.save();
          break;
        }
        default:
          throw new Error('dsds');
      }
      this.ctx.body = 'success';
      await service.save();
    }

    async processors() {
      this.ctx.body = (await this.ctx.model.Servicer.find(
        { 'privilege.canProcessingService': true },
        { name: 1 }
      ).lean()).map(item => [item.name, item._id]);
    }

    async paymentStatus() {
      const { ctx } = this;
      const service = await ctx.model.Service.findById(ctx.query.id)
        .select('status orderId')
        .lean();
      const payment = await ctx.model.Order.findById(service.orderId)
        .select('totalFee hasPaid -_id')
        .lean();
      ctx.body = {
        status: maps[service.status],
        payment
      };
    }
  }
  return Controller;
};
